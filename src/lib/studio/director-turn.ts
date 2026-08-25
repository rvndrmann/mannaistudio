import type { AuthenticatedProjectContext } from "./server-context"
import { buildDirectorInstructions, replayToolResults, selectConversationWindow } from "./conversation"
import { buildProjectContext } from "./project-context"
import { fetchDirectorRuntimeSettings } from "./director-runtime-settings"
import { normalizeDirectorGlobalInstructions } from "./instructions"
import { loadProjectBrandContext } from "./brand-server"
import { runDirectorAgent } from "./director-agent"
import { collectDirectorVisionAttachments } from "./director-vision"
import { buildProjectStateSummary, loadProductionSnapshot } from "./project-state-summary"
import { autopilotInstructionBlock, readAutopilotSettings } from "./autopilot"
import { computePipelineStage } from "./pipeline"
import { buildProductionProgress, levelForXp, stagesReached } from "./production-progress"
import type { DirectorTimelineBlock } from "./timeline"
import { actionMatchesRequestedShots, parseTargetShotNumbers } from "./shot-intent"
import { createWorkflowRun } from "./workflow-runs"
import { episodeFootageInstructions, fetchEpisodeFootage } from "./episode-continuity"
import { fetchDirectorWorkflows } from "./workflows"
import type { MentionableEntity } from "./entity-mentions"
import { chatModelProvider } from "@/lib/byok/chat-source"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { OwnKeysOnlyError } from "@/lib/byok/billing"
import { chatTurnCredits, type TokenUsage } from "@/lib/byok/chat-pricing"
import { hasTokenCounts } from "@/lib/byok/usage"
import { deductUserCredits } from "./credits"

/**
 * One Director turn, from the reads it needs to the reply it persists.
 *
 * This lived inside the chat route, which meant a turn could only ever run
 * where that route runs — and that host stops a request at thirty seconds while
 * real turns take between thirty-six and fifty-one. The turn is the valuable
 * part and it is not specific to any host, so it lives here, and the route
 * became one of its callers rather than its only possible home.
 *
 * Nothing about the turn changed in the move. The reads, their order, the
 * billing, and what is written are the same; the difference is only that
 * something other than a Next.js route can now call it.
 */

/** How many recent messages are read back per turn. */
const HISTORY_PAGE = 40

export type DirectorTurnInput = {
  context: AuthenticatedProjectContext
  episode: { id: string }
  sessionId: string
  model: string
  /** What the user sent, as they sent it. */
  message: string
  /** The same, with any @mention context appended, as the model sees it. */
  modelMessage: string
  mentionedEntities: MentionableEntity[]
  uniqueMentionIds: string[]
  idempotencyKey: string
}

/**
 * Sets a turn up and hands back the pieces needed to run it.
 *
 * Split in two because the caller needs the run's id before the agent starts:
 * a turn that dies mid-flight has to be recorded against the run it was, and by
 * then there is no returning value to read it from.
 */
export async function prepareDirectorTurn(input: DirectorTurnInput) {
  const { context, episode, sessionId, model, modelMessage, mentionedEntities, uniqueMentionIds } = input
  const projectId = context.project.id
  const body = { message: input.message, idempotencyKey: input.idempotencyKey }

// Everything the turn needs before the agent can start, in one batch. The
// session's model stamp, the run row, the history page and the withdrawal
// of superseded cards were four sequential round trips and none of them
// needs anything from the others.
//
// The user's own message is inserted after this rather than in it: it is
// the one write here that genuinely depends on another, since it carries
// the run id.
const [, workflowRun, recentRes, openingRes, totalRes, withdrawn] = await Promise.all([
  context.supabase.from("creator_chat_sessions").update({ model }).eq("id", sessionId).eq("user_id", context.user.id),
  createWorkflowRun(context, { episodeId: episode.id, sessionId, objective: body.message, maxSteps: 10 }),
  // The newest turns, the very first one, and how many there are in total.
  //
  // This read used to be `ascending: true` with `limit(40)`, which returns
  // the *oldest* forty messages rather than the most recent ones. Past
  // message forty the Director stopped being shown anything that had been
  // said since — it answered every turn from the opening of the session and
  // never saw the conversation it was actually in.
  //
  // So: the recent page descending (reversed back into reading order
  // below), the opening message on its own because it holds the brief, and
  // a count so the compaction notice can say honestly how much is not being
  // shown.
  context.supabase.from("creator_chat_messages").select("id, role, content, tool_calls").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(HISTORY_PAGE),
  context.supabase.from("creator_chat_messages").select("id, role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(1),
  context.supabase.from("creator_chat_messages").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
  // Replying instead of approving is an answer: the user wants to steer
  // before anything is generated. The card it replaces must not sit there
  // pending forever, or block the ones that come after it.
  withdrawSupersededProposals(context, sessionId),
])
if (recentRes.error) throw recentRes.error
const recent = (recentRes.data || []).slice().reverse()
const opening = openingRes.data?.[0]
// Only when it is not already in the page, or it would be sent twice.
const history = opening && !recent.some((item) => item.id === opening.id) ? [opening, ...recent] : recent
const droppedBefore = Math.max(0, (totalRes.count ?? history.length) - history.length)

const { data: userMessage, error: userError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, workflow_run_id: workflowRun.id, role: "user", content: body.message, referenced_entity_ids: uniqueMentionIds }).select().single()
if (userError) throw userError

const buildAgentInput = async () => {
  // Independent reads, so they go together. Run one after another these
  // were most of the delay between sending a message and the first token,
  // and none of them needs anything the others return.
  const [project, instructionSettings, brandContext, runtimeSettings, visionAttachments, projectState, stageKey] = await Promise.all([
    buildProjectContext(context.supabase, context.project),
    context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle(),
    loadProjectBrandContext(context.supabase, context.project),
    fetchDirectorRuntimeSettings(context.supabase),
    collectDirectorVisionAttachments({
      supabase: context.supabase,
      projectId,
      sessionId,
      episodeId: episode.id,
      mentionedEntities: (mentionedEntities || []) as MentionableEntity[],
    }),
    buildProjectStateBlock(context, episode.id, sessionId),
    // Which specialist opens the turn, read from what the workspace holds
    // rather than from the words in the message.
    loadProductionSnapshot(context.supabase, projectId, episode.id, sessionId)
      .then((snapshot) => computePipelineStage(snapshot).key)
      .catch(() => ""),
  ])
  const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings.data?.value)
  return {
    context,
    model,
    instructions: buildDirectorInstructions(project, globalInstructions, brandContext),
    projectState: [
      projectState,
      // Read from the project rather than sent with the message: the mode
      // belongs to the production, and a request that forgot to carry it
      // would silently put an auto run back to manual phrasing.
      autopilotInstructionBlock(readAutopilotSettings(context.project.metadata).mode),
      // Otherwise the model keeps waiting on an approval the user has
      // already answered with words, and asks them to press a card that is
      // no longer there.
      withdrawn.length
        ? `The user replied instead of approving, so ${withdrawn.length === 1 ? "this proposal has" : "these proposals have"} been withdrawn: ${withdrawn.join("; ")}. Their message is the new instruction — work from it, and propose again only if it still calls for one.`
        : "",
    ].filter(Boolean).join("\n\n"),
    messages: selectConversationWindow(
      [
        ...replayToolResults(history).filter((item) => item.content),
        { role: "user", content: modelMessage },
      ],
      undefined,
      { droppedBefore },
    ),
    sessionId,
    idempotencyKey: body.idempotencyKey,
    runtimeSettings,
    episodeId: episode.id,
    objective: modelMessage,
    visionAttachments,
    stageKey,
    workflowRunId: workflowRun.id,
  }
}
// The agent talks to OpenAI or Gemini through the same modules generation
// uses, so it can run on a customer's connected key — it was simply never
// given a scope to do it in, and every turn spent the platform's budget
// instead, including for the customer paying their own way for everything
// else.
//
// "Only my own keys" is honoured here too. A setting that stops generation
// while the agent keeps running on us does not mean what it says.
const chatProvider = chatModelProvider(model)
// Set when the turn ran on the customer's own account, so the metering
// below knows not to charge for something we were not billed for.
let ranOnCustomerKey = false
const runOnRightAccount = async <T,>(work: () => Promise<T>): Promise<T> => {
  if (!chatProvider) return work()
  const connected = await hasCredential(context.user.id, chatProvider).catch(() => false)
  if (connected) {
    ranOnCustomerKey = true
    const result = await withCredential({ userId: context.user.id, provider: chatProvider }, (parts) =>
      runWithCredential(chatProvider, parts, work))
    // Null means the credential vanished between the check and the read.
    // Falling through to the platform key would bill us for a turn the user
    // asked to pay for themselves.
    if (result === null) throw new Error("The provider key for this model is no longer connected.")
    return result
  }
  if (await ownKeysOnly(context.user.id).catch(() => false)) {
    throw new OwnKeysOnlyError(chatProvider)
  }
  return work()
}

/**
 * Bills a completed turn.
 *
 * After the turn, never before: a turn that failed produced no reply and
 * should cost nothing, and the token count is not known until it is done.
 * A turn on the customer's own key is free here because their provider has
 * already billed them for it directly.
 *
 * A failed deduction is logged and swallowed. Losing the reply the user is
 * reading over a billing write would be a worse outcome than an uncharged
 * turn, and the transaction ledger records what did happen either way.
 */
const chargeForTurn = async (response: Awaited<ReturnType<typeof runDirectorAgent>>) => {
  if (ranOnCustomerKey) return 0
  const usage = (response.usage || {}) as TokenUsage
  if (!hasTokenCounts(usage as Record<string, unknown>)) {
    // A turn nobody counted is free, and that has to be visible: a silent
    // zero here is indistinguishable from metering that is switched off.
    console.warn(`Director turn on ${model} reported no token usage; nothing charged.`)
    return 0
  }
  const credits = chatTurnCredits(model, usage)
  if (credits <= 0) return 0
  try {
    const deduction = await deductUserCredits(
      context.user.id,
      credits,
      model,
      "AI Director chat turn",
      context.supabase,
    )
    if (!deduction.success) console.warn("Could not charge for a Director turn:", deduction.errorMessage)
  } catch (error) {
    console.warn("Could not charge for a Director turn:", error instanceof Error ? error.message : "unknown")
  }
  return credits
}

const persistAssistantMessage = async (response: Awaited<ReturnType<typeof runDirectorAgent>>) => {
  // Read after the run, so the button offers the step the workspace is on
  // once this run's writes have landed.
  const [nextStep, progress] = await Promise.all([
    nextStepBlock(context, projectId, episode.id, parseTargetShotNumbers(body.message), sessionId),
    progressBlock(context, projectId, episode.id, sessionId),
  ])
  const timeline = [...response.timeline, ...(progress ? [progress] : []), ...(nextStep ? [nextStep] : [])]
  const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, workflow_run_id: workflowRun.id, role: "assistant", content: response.content, tool_calls: response.toolCalls, suggested_actions: response.suggestedActions, timeline_blocks: timeline, timeline_version: 1 }).select().single()
  if (assistantError) throw assistantError
  // Charged here so both the streaming and non-streaming paths bill exactly
  // once, and only after the reply is safely persisted.
  const creditsCharged = await chargeForTurn(response)
  return {
    sessionId,
    userMessage,
    assistantMessage,
    provider: model.startsWith("gemini") ? "google" : "openai",
    model,
    usage: response.usage,
    // Told to the client so the credit badge can move, and so a turn on the
    // customer's own key can say plainly that it cost nothing.
    creditsCharged,
    billingMode: ranOnCustomerKey ? "byok" : "credits",
  }
}
  return { workflowRun, userMessage, buildAgentInput, runOnRightAccount, persistAssistantMessage }
}

/** Runs a prepared turn to completion and persists its reply. */
export async function executeDirectorTurn(
  prepared: Awaited<ReturnType<typeof prepareDirectorTurn>>,
  onEvent?: Parameters<typeof runDirectorAgent>[0]["onEvent"],
) {
  const response = await prepared.runOnRightAccount(async () =>
    runDirectorAgent({ ...(await prepared.buildAgentInput()), ...(onEvent ? { onEvent } : {}) }))
  return prepared.persistAssistantMessage(response)
}

export async function withdrawSupersededProposals(
  context: AuthenticatedProjectContext,
  sessionId: string,
) {
  try {
    const { data: pending } = await context.supabase
      .from("creator_action_proposals")
      .select("id,title,creator_tool_executions(session_id)")
      .eq("project_id", context.project.id)
      .eq("status", "pending")
    // Only this conversation's approvals: another chat's open question is not
    // answered by what was typed here.
    const mine = (pending || []).filter((proposal) => {
      const execution = proposal.creator_tool_executions as { session_id?: string | null } | null
      return execution?.session_id === sessionId
    })
    if (!mine.length) return []
    const { error } = await context.supabase
      .from("creator_action_proposals")
      .update({ status: "expired", decided_at: new Date().toISOString() })
      .in("id", mine.map((proposal) => proposal.id))
    if (error) throw error
    return mine.map((proposal) => (typeof proposal.title === "string" ? proposal.title : "a pending approval"))
  } catch (error) {
    // A stuck card is better than a failed message.
    console.warn("Could not withdraw superseded proposals:", error)
    return []
  }
}

/**
 * The one step the production is waiting on, as a timeline block the chat
 * renders as a button. Every reply carries it so a turn ends with something the
 * user can press — the user stays in the loop by pressing it, and the pipeline
 * only moves when they do.
 */
export async function nextStepBlock(
  context: AuthenticatedProjectContext,
  projectId: string,
  episodeId: string,
  requestedShotNumbers: number[] = [],
  sessionId?: string,
): Promise<DirectorTimelineBlock | null> {
  try {
    const stage = computePipelineStage(await loadProductionSnapshot(context.supabase, projectId, episodeId, sessionId))
    if (!stage.nextAction) return null
    // The primary step first, then the moves that make sense beside it: film the
    // shot whose frame was just approved, or redo the frame. Each is judged on
    // its own against the shots this turn was about — dropping the whole block
    // because the headline step moved on to the next shot took the steps for
    // *this* shot down with it. The schema caps this at five.
    const actions = [stage.nextAction, ...stage.alternatives]
      // The pipeline action describes the state left after this turn. It must
      // survive even when the completed message named a specific shot; only
      // alternative shot actions need to stay scoped to that request.
      .filter((action, index) => index === 0 || actionMatchesRequestedShots(action.intent, requestedShotNumbers))
      .slice(0, 5)
    if (!actions.length) return null
    return {
      type: "suggested_actions",
      actions: actions.map((action) => ({ ...action, payload: { stage: stage.key, summary: stage.summary } })),
    }
  } catch (error) {
    // A reply that lost its next-step button is still a reply. Failing the whole
    // run over the button would lose the work the run just did — but it still
    // ends with something to press, because a user with no button has to guess
    // what to type, which is what this block exists to prevent.
    console.warn("Could not build the pipeline next step:", error)
    return {
      type: "suggested_actions",
      actions: [{
        id: "pipeline-unknown",
        label: "What should we do next?",
        intent: "Tell me where this production currently stands and what the single next step is.",
        risk: "read" as const,
        recommended: true,
        payload: {},
      }],
    }
  }
}

/**
 * The production track shown under the reply.
 *
 * Built after the run so it reflects what the run just did, and it awards the
 * XP for any stage the episode reached on the way — once each, in the database,
 * so recomputing the stage every turn cannot pay for the same one twice.
 */
export async function progressBlock(
  context: AuthenticatedProjectContext,
  projectId: string,
  episodeId: string,
  sessionId?: string,
): Promise<DirectorTimelineBlock | null> {
  try {
    const snapshot = await loadProductionSnapshot(context.supabase, projectId, episodeId, sessionId)
    const progress = buildProductionProgress(snapshot)

    let awardedXp = 0
    let level = levelForXp(progress.earnedXp).level
    for (const stage of stagesReached(snapshot)) {
      const { data, error } = await context.supabase.rpc("award_episode_stage_xp", {
        p_episode_id: episodeId,
        p_stage_key: stage.key,
        p_xp: stage.xp,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      awardedXp += Number(row?.awarded || 0)
      if (row?.level) level = Number(row.level)
    }

    return {
      type: "production_progress",
      headline: progress.headline,
      percent: progress.percent,
      completedStages: progress.completedStages,
      totalStages: progress.totalStages,
      earnedXp: progress.earnedXp,
      awardedXp,
      level,
      stages: progress.stages.map((stage) => ({ key: stage.key, title: stage.title, status: stage.status, xp: stage.xp })),
    }
  } catch (error) {
    // The track is a garnish on the reply, never a reason to lose it.
    console.warn("Could not build the production progress block:", error)
    return null
  }
}

/**
 * What the workspace currently holds, as the agent's opening context.
 *
 * Kept apart from the standing instructions and sent after them, because every
 * line of it changes as the production moves and the provider caches on a
 * matching prefix — in front, a single saved shot threw away the cache for the
 * whole brief behind it.
 *
 * This is not a guess about what the user wants. It is what the database says
 * is there, which is what the model needs in order to decide for itself.
 */
export async function buildProjectStateBlock(context: AuthenticatedProjectContext, episodeId: string, sessionId: string) {
  // Four independent reads. Sequentially they were four round trips the user
  // spent watching a spinner before the model had even been called.
  const [workflows, uploadContext, projectState, episodeContext] = await Promise.all([
    fetchDirectorWorkflows(context.supabase),
    recentUploadContext(context, sessionId),
    buildProjectStateSummary(context.supabase, context.project.id, episodeId),
    // The other episodes and where each one's footage ends. Without it the agent
    // knows only the episode it is standing in, so a request to carry a shot over
    // from an earlier one had no id to look anything up with.
    fetchEpisodeFootage(context.supabase, context.project.id)
      .then((footage) => episodeFootageInstructions(footage, episodeId))
      .catch((error) => { console.warn("Could not read the project's episodes:", error); return "" }),
  ])
  const metadata = (context.project.metadata as Record<string, unknown> | undefined) || {}
  const episodeWorkflows = (metadata.episode_workflows as Record<string, unknown> | undefined) || {}
  const selectedId = typeof episodeWorkflows[episodeId] === "string"
    ? episodeWorkflows[episodeId] as string
    : typeof metadata.default_workflow_id === "string"
      ? metadata.default_workflow_id
      : typeof (metadata.basic_settings as Record<string, unknown> | undefined)?.workflow === "string"
        ? (metadata.basic_settings as Record<string, unknown>).workflow as string
        : ""
  const workflow = workflows.find((item) => item.id === selectedId && item.status === "active")
  const workflowLines = workflow ? [
    "Selected AI Director workflow:",
    `Workflow: ${workflow.title} (${workflow.id})`,
    `Workflow skill: ${workflow.skill || "Not specified"}`,
    `Workflow instructions: ${workflow.instructions || workflow.description || "Follow the selected workflow."}`,
  ] : []
  return [
    projectState,
    episodeContext,
    ...workflowLines,
    ...uploadContext,
  ].filter(Boolean).join("\n\n")
}

export async function recentUploadContext(context: AuthenticatedProjectContext, sessionId: string) {
  const { data } = await context.supabase
    .from("creator_chat_messages")
    .select("media,created_at")
    .eq("session_id", sessionId)
    .not("media", "is", null)
    .order("created_at", { ascending: false })
    .limit(10)
  const media = (data || []).flatMap((message) => Array.isArray(message.media) ? message.media : [])
  if (!media.length) return []
  return [
    "Recent user-uploaded chat media available as references. You may propose adding these to assets or storyboard, and you may use image paths as generation references when the user asks:",
    ...media.map((item, index) => {
      const value = item as Record<string, unknown>
      return `${index + 1}. type=${String(value.type || "file")} name=${String(value.name || "uploaded media")} storage_path=${String(value.path || "")} content_type=${String(value.contentType || "")}`
    }),
  ]
}


