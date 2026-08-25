import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions, replayToolResults, selectConversationWindow } from "@/lib/studio/conversation"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { directorChatInputSchema } from "@/lib/studio/domain"
import { describeError } from "@/lib/studio/errors"
import { defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import { GoogleProviderError } from "@/lib/studio/google"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { loadProjectBrandContext } from "@/lib/studio/brand-server"
import { runDirectorAgent } from "@/lib/studio/director-agent"
import { chatModelProvider } from "@/lib/byok/chat-source"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { OwnKeysOnlyError } from "@/lib/byok/billing"
import { chatTurnCredits, type TokenUsage } from "@/lib/byok/chat-pricing"
import { hasTokenCounts } from "@/lib/byok/usage"
import { deductUserCredits } from "@/lib/studio/credits"
import { fetchDirectorRuntimeSettings } from "@/lib/studio/director-runtime-settings"
import { buildEntityMentionContext, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { collectDirectorVisionAttachments } from "@/lib/studio/director-vision"
import { buildProjectStateSummary, loadProductionSnapshot } from "@/lib/studio/project-state-summary"
import { autopilotInstructionBlock, readAutopilotSettings } from "@/lib/studio/autopilot"
import { computePipelineStage } from "@/lib/studio/pipeline"
import { buildProductionProgress, levelForXp, stagesReached } from "@/lib/studio/production-progress"
import type { DirectorTimelineBlock } from "@/lib/studio/timeline"
import { actionMatchesRequestedShots, parseTargetShotNumbers } from "@/lib/studio/shot-intent"
import { createWorkflowRun } from "@/lib/studio/workflow-runs"
import { episodeFootageInstructions, fetchEpisodeFootage } from "@/lib/studio/episode-continuity"

// A Director run can take minutes, and it must finish even when the browser
// that started it goes away: the reply and the workflow run are persisted
// server-side, and the page rejoins the run after a reload.
export const maxDuration = 300

/**
 * Every message reaches the agent.
 *
 * This route used to guess what the user wanted before the model saw the
 * message — about ten regex fast paths, each recognising its work by the nouns
 * and verbs in the sentence, each answering on its own. They were added one at
 * a time to fix one bad reply each, and every one of them could be wrong about
 * a sentence it had not been written for.
 *
 * Two things made them worse than the model they were guarding against. They
 * broke on ordinary phrasing: "make" is the verb in "make me some images" and
 * also in "edit the character to make her hair red", so an edit request was
 * answered by generating art and replacing the art it already had. And they
 * spent credits directly, outside the tool registry, so they produced a charge
 * where the agent's own submit_generation would have produced an approval card
 * the user could refuse.
 *
 * So the guessing is gone. The model decides what to do, and the approval gate
 * on costly and destructive tools is what keeps a wrong decision cheap.
 */

/** How many recent messages are read back per turn. */
const HISTORY_PAGE = 40

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const body = directorChatInputSchema.parse({ ...(await request.json()), projectId })
    // The episode, the entities the message mentions and the admin's model list
    // are three independent reads that were run one after another, ahead of
    // everything else, on every turn. Their checks still happen in the same
    // order below, so a bad episode is still answered with 404 before anything
    // is said about entities.
    const uniqueMentionIds = Array.from(new Set(body.mentionedEntityIds))
    const [episodeRes, mentionedRes, modelSettingsRes] = await Promise.all([
      context.supabase.from("creator_episodes").select("id").eq("id", body.episodeId).eq("project_id", projectId).maybeSingle(),
      uniqueMentionIds.length
        ? context.supabase.from("creator_entities").select("*").eq("project_id", projectId).in("id", uniqueMentionIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle(),
    ])
    const episode = episodeRes.data
    if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    const mentionedEntities = mentionedRes.data
    if (mentionedRes.error) throw mentionedRes.error
    if ((mentionedEntities || []).length !== uniqueMentionIds.length) {
      return NextResponse.json({ error: "One or more mentioned entities do not belong to this project." }, { status: 400 })
    }
    const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])
    const modelMessage = mentionContext ? `${body.message}\n\n${mentionContext}` : body.message
    const activeModels = activeDirectorModels(modelSettingsRes.data?.value)
    const fallbackModel = activeModels.find((item) => item.id === defaultOpenAIDirectorModel())?.id || activeModels[0]?.id || defaultOpenAIDirectorModel()
    const model = body.model || fallbackModel
    if (!activeModels.some((item) => item.id === model)) {
      return NextResponse.json({ error: "This AI Director model is paused by an admin." }, { status: 403 })
    }
    const { data: existingSession } = await context.supabase.from("creator_chat_sessions").select("id").eq("episode_id", episode.id).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    const sessionId = body.sessionId || existingSession?.id || (await context.supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: context.user.id, title: "AI Director", model }).select("id").single()).data?.id
    if (!sessionId) throw new Error("Could not create an AI Director chat session")
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

    // A non-streaming client still gets the single JSON body it expects.
    if (!body.stream) {
      return NextResponse.json(await persistAssistantMessage(await runOnRightAccount(async () => runDirectorAgent(await buildAgentInput()))))
    }

    const encoder = new TextEncoder()
    // Why a run stopped, when it stops for a reason the run itself never sees.
    //
    // A run that is swept up later can only be reported as "the server went
    // away", because by then nobody knows what happened — and the two causes
    // want opposite fixes. `cancel` fires the moment the browser lets go of the
    // stream: a reload, a navigation, a closed tab. Recording it is what tells
    // a client that hung up from a process that died.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { /* client went away */ }
        }
        try {
          send({ type: "start", sessionId })
          const response = await runOnRightAccount(async () => runDirectorAgent({ ...(await buildAgentInput()), onEvent: send }))
          send({ type: "done", ...(await persistAssistantMessage(response)) })
        } catch (error) {
          console.error("DIRECTOR CHAT STREAM ERROR:", error)
          const failure = describeError(error, "AI Director chat failed")
          // The browser holding this stream sees the error, but a browser that
          // reloaded sees only the run — and an unfinished run reads as one
          // still working. Write the ending here so the failure survives the
          // page that was watching it.
          await recordFailedRun(context, { runId: workflowRun.id, sessionId, message: failure, projectId, episodeId: episode.id })
          send({ type: "error", error: failure })
        } finally {
          controller.close()
        }
      },
      // Best effort, and deliberately not awaited by anything: the run carries
      // on, because the work is worth finishing whether or not anyone is still
      // watching it. This only leaves a note saying the watcher left.
      cancel(reason) {
        void noteClientDisconnect(context, { runId: workflowRun.id, reason: String(reason ?? "the browser closed the connection") })
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Proxies that buffer would defeat the point of streaming.
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("DIRECTOR CHAT ERROR:", error)
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid chat request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: describeError(error, "AI Director chat failed") }, { status: (error instanceof OpenAIProviderError || error instanceof GoogleProviderError) ? error.status : studioErrorStatus(error) })
  }
}
/**
 * Leaves a failed run in a state the chat can read.
 *
 * Two things have to be true afterwards, or the page that reloads mid-run is
 * left waiting: the run must be finished, so it stops reading as in flight, and
 * the turn must carry a reply saying what went wrong, so the user's message is
 * not sitting there unanswered with no explanation.
 */
/**
 * Records that the browser watching a run let go of it.
 *
 * Written onto the run rather than into a log, because the question it answers
 * is asked about one run: a run found dead later reads as "the server went
 * away", and this is the only thing that can say it was the client instead. The
 * run's status is deliberately untouched — a disconnect is not a failure, and a
 * run that goes on to finish should still read as finished.
 */
async function noteClientDisconnect(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
  input: { runId: string; reason: string },
) {
  try {
    const { data } = await context.supabase
      .from("creator_workflow_runs")
      .select("summary")
      .eq("id", input.runId)
      .eq("user_id", context.user.id)
      .maybeSingle()
    const summary = (data?.summary as Record<string, unknown> | null) || {}
    await context.supabase
      .from("creator_workflow_runs")
      .update({ summary: { ...summary, client_disconnected_at: new Date().toISOString(), client_disconnect_reason: input.reason } })
      .eq("id", input.runId)
      .eq("user_id", context.user.id)
      .is("completed_at", null)
  } catch (error) {
    console.warn("Could not record the client disconnect for run", input.runId, error)
  }
}

async function recordFailedRun(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
  input: { runId: string; sessionId: string; message: string; projectId: string; episodeId: string },
) {
  try {
    // Guarded on completed_at so a run that already wrote its own ending — a
    // tool turn that failed and recorded why — keeps the better account of it.
    await context.supabase
      .from("creator_workflow_runs")
      .update({ status: "failed", error: { message: input.message }, completed_at: new Date().toISOString() })
      .eq("id", input.runId)
      .eq("user_id", context.user.id)
      .is("completed_at", null)
    const { data: replied } = await context.supabase
      .from("creator_chat_messages")
      .select("id")
      .eq("workflow_run_id", input.runId)
      .eq("role", "assistant")
      .limit(1)
      .maybeSingle()
    if (replied) return
    // A failed run is exactly when the user most needs somewhere to go, and a
    // run cut short by the request timeout looked identical to one that simply
    // stopped: a warning, and nothing to press. The production is still standing
    // wherever this run left it, so the step it is waiting on is still the right
    // one to offer.
    const nextStep = await nextStepBlock(context, input.projectId, input.episodeId, [], input.sessionId)
    await context.supabase.from("creator_chat_messages").insert({
      session_id: input.sessionId,
      workflow_run_id: input.runId,
      role: "assistant",
      content: `I could not finish that: ${input.message}`,
      timeline_blocks: [
        { type: "warning", code: "run_failed", message: input.message, recoverable: true, actions: [] },
        ...(nextStep ? [nextStep] : []),
      ],
      timeline_version: 1,
    })
  } catch (error) {
    // Reporting the failure must not become a second failure.
    console.warn("Could not record the failed Director run:", error)
  }
}

/**
 * Retires the approvals the user answered with words rather than a button.
 *
 * A pending proposal is a question. When the next thing that arrives is a new
 * instruction, the question has been answered — the user is redirecting, not
 * ignoring — so the card is withdrawn and the new message becomes the brief.
 * Left pending it stayed on screen with no way to resolve it, and everything
 * behind it queued up on an approval that was never coming.
 */
async function withdrawSupersededProposals(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
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
async function nextStepBlock(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
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
async function progressBlock(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
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
async function buildProjectStateBlock(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, episodeId: string, sessionId: string) {
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

async function recentUploadContext(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, sessionId: string) {
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

