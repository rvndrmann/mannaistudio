import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions, selectConversationWindow } from "@/lib/studio/conversation"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { directorChatInputSchema } from "@/lib/studio/domain"
import { describeError } from "@/lib/studio/errors"
import { defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import { GoogleProviderError } from "@/lib/studio/google"
import { generateOpenAIImage } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { requestDirectorTool } from "@/lib/studio/tool-service"
import { fetchDirectorWorkflows, selectedWorkflowId, workflowContinuesFromPreviousClip } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { runDirectorAgent } from "@/lib/studio/director-agent"
import { fetchDirectorRuntimeSettings } from "@/lib/studio/director-runtime-settings"
import { buildEntityMentionContext, chosenReferences, entityPrimaryReference, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { collectDirectorVisionAttachments } from "@/lib/studio/director-vision"
import { buildEntityReferenceImagePrompt, openAIImageQuality, parseBulkEntityImageIntent, projectImageQuality, projectVisualStyle, visualStyleDirective, type BulkEntityImageIntent } from "@/lib/studio/entity-image-workflow"
import { createBytePlusAsset } from "@/lib/studio/byteplus"
import { VERIFIED_ASSET } from "@/lib/studio/asset-verification"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { buildProjectStateSummary, loadProductionSnapshot } from "@/lib/studio/project-state-summary"
import { computePipelineStage, withSkippedShots } from "@/lib/studio/pipeline"
import type { DirectorTimelineBlock } from "@/lib/studio/timeline"
import { actionMatchesRequestedShots, buildVideoContinuationPrompt, isAmbiguousShotRedo, parseShotImageBatchIntent, parseTargetShotNumbers, parseVideoShotReferenceIntent, wantsRedo } from "@/lib/studio/shot-intent"
import { stripIdentityDescriptions } from "@/lib/studio/prompt-sanitizer"
import { addWorkflowStep, createWorkflowRun, finishWorkflowRun } from "@/lib/studio/workflow-runs"
import { buildGenerationTargetSnapshot, verifyGenerationTarget } from "@/lib/studio/generation-target"
import { forbidsImageGeneration, forbidsMediaGeneration, forbidsVideoGeneration } from "@/lib/studio/media-intent"
import { episodeFootageInstructions, fetchEpisodeFootage, handoffAlias, previousEpisodeHandoff } from "@/lib/studio/episode-continuity"
import { ensureShotLocations } from "@/lib/studio/shot-location"
import { resolveShotSeconds } from "@/lib/studio/shot-duration"
import { beatRuntimeSeconds, videoPromptFor } from "@/lib/studio/shot-video-prompt"

// A Director run can take minutes, and it must finish even when the browser
// that started it goes away: the reply and the workflow run are persisted
// server-side, and the page rejoins the run after a reload.
export const maxDuration = 300

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const body = directorChatInputSchema.parse({ ...(await request.json()), projectId })
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", body.episodeId).eq("project_id", projectId).maybeSingle()
    if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    const uniqueMentionIds = Array.from(new Set(body.mentionedEntityIds))
    const { data: mentionedEntities, error: mentionedEntityError } = uniqueMentionIds.length
      ? await context.supabase
        .from("creator_entities")
        .select("*")
        .eq("project_id", projectId)
        .in("id", uniqueMentionIds)
      : { data: [], error: null }
    if (mentionedEntityError) throw mentionedEntityError
    if ((mentionedEntities || []).length !== uniqueMentionIds.length) {
      return NextResponse.json({ error: "One or more mentioned entities do not belong to this project." }, { status: 400 })
    }
    const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])
    const modelMessage = mentionContext ? `${body.message}\n\n${mentionContext}` : body.message
    const { data: modelSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle()
    const activeModels = activeDirectorModels(modelSettings?.value)
    const fallbackModel = activeModels.find((item) => item.id === defaultOpenAIDirectorModel())?.id || activeModels[0]?.id || defaultOpenAIDirectorModel()
    const model = body.model || fallbackModel
    if (!activeModels.some((item) => item.id === model)) {
      return NextResponse.json({ error: "This AI Director model is paused by an admin." }, { status: 403 })
    }
    const { data: existingSession } = await context.supabase.from("creator_chat_sessions").select("id").eq("episode_id", episode.id).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    const sessionId = body.sessionId || existingSession?.id || (await context.supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: context.user.id, title: "AI Director", model }).select("id").single()).data?.id
    if (!sessionId) throw new Error("Could not create an AI Director chat session")
    await context.supabase.from("creator_chat_sessions").update({ model }).eq("id", sessionId).eq("user_id", context.user.id)
    const workflowRun = await createWorkflowRun(context, { episodeId: episode.id, sessionId, objective: body.message, maxSteps: 10 })
    const { data: history, error: historyError } = await context.supabase.from("creator_chat_messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(40)
    if (historyError) throw historyError
    const { data: userMessage, error: userError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, workflow_run_id: workflowRun.id, role: "user", content: body.message, referenced_entity_ids: uniqueMentionIds }).select().single()
    if (userError) throw userError
    // Replying instead of approving is an answer: the user wants to steer before
    // anything is generated. The card it replaces must not sit there pending
    // forever, or block the ones that come after it.
    const withdrawn = await withdrawSupersededProposals(context, sessionId)

    // A fast path can spend a minute inside an image model. Running it inside
    // the stream is what lets the browser show the request moving while it does
    // — before this, nothing at all reached the client until the picture was
    // finished, so the chat looked frozen on the message the user just sent.
    const runWorkflow = async (onProgress?: (label: string) => void) => {
      try {
        return await maybeHandleWorkflowRequest({ context, projectId, episodeId: episode.id, sessionId, workflowRunId: workflowRun.id, message: body.message, history: history || [], idempotencyKey: body.idempotencyKey, mentionedEntities: (mentionedEntities || []) as ResolvedMention[], onProgress })
      } catch (error) {
        await finishWorkflowRun(context, workflowRun.id, "failed", { mode: "direct" }, { message: describeError(error, "Direct workflow failed") })
        throw error
      }
    }
    const persistWorkflowMessage = async (workflow: NonNullable<Awaited<ReturnType<typeof runWorkflow>>>) => {
      const workflowRecord = workflow.result && typeof workflow.result === "object" ? workflow.result as Record<string, unknown> : {}
      const approvalRequired = Boolean(workflowRecord.approvalRequired || workflowRecord.proposal)
      await addWorkflowStep(context, { runId: workflowRun.id, sequence: 1, specialist: "orchestrator", label: approvalRequired ? "Prepare approval" : "Complete direct workflow", status: approvalRequired ? "awaiting_approval" : "completed", output: workflow.result })
      await finishWorkflowRun(context, workflowRun.id, approvalRequired ? "awaiting_approval" : "completed", { mode: "direct", approvalRequired })
      const nextStep = await nextStepBlock(context, projectId, episode.id, parseTargetShotNumbers(body.message))
      // A handler that already worked out its own next step keeps it: it knows
      // things the shared block cannot, such as which shot was being skipped.
      const carriesOwnTimeline = Array.isArray((workflow.message as Record<string, unknown>).timeline_blocks)
      const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert({
        ...workflow.message,
        workflow_run_id: workflowRun.id,
        ...(!carriesOwnTimeline && nextStep ? { timeline_blocks: [nextStep], timeline_version: 1 } : {}),
      }).select().single()
      if (assistantError) throw assistantError
      const workflowCredits = workflow.result && typeof workflow.result === "object"
        ? workflow.result as Record<string, unknown>
        : {}
      return {
        sessionId,
        userMessage,
        assistantMessage,
        workflow: workflow.result,
        provider: workflow.provider,
        model,
        creditsCharged: typeof workflowCredits.creditsCharged === "number" ? workflowCredits.creditsCharged : 0,
        creditBalance: typeof workflowCredits.creditBalance === "number" ? workflowCredits.creditBalance : undefined,
      }
    }
    // Built only when the agent is actually going to run: the fast paths need
    // none of it, and reading the brief, settings, and vision attachments first
    // is dead time the user spends watching a spinner.
    const buildAgentInput = async () => {
      const project = await buildProjectContext(context.supabase, context.project)
      const { data: instructionSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
      const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings?.value)
      const runtimeSettings = await fetchDirectorRuntimeSettings(context.supabase)
      const visionAttachments = await collectDirectorVisionAttachments({
        supabase: context.supabase,
        projectId,
        sessionId,
        episodeId: episode.id,
        mentionedEntities: (mentionedEntities || []) as MentionableEntity[],
      })
      return {
        context,
        model,
        instructions: [
          await buildWorkflowInstructions(context, episode.id, sessionId, buildDirectorInstructions(project, globalInstructions)),
          // Otherwise the model keeps waiting on an approval the user has
          // already answered with words, and asks them to press a card that is
          // no longer there.
          withdrawn.length
            ? `The user replied instead of approving, so ${withdrawn.length === 1 ? "this proposal has" : "these proposals have"} been withdrawn: ${withdrawn.join("; ")}. Their message is the new instruction — work from it, and propose again only if it still calls for one.`
            : "",
        ].filter(Boolean).join("\n\n"),
        messages: selectConversationWindow([...(history || []).filter((item) => item.content).map((item) => ({ role: item.role as "user" | "assistant", content: item.content as string })), { role: "user", content: modelMessage }]),
        sessionId,
        idempotencyKey: body.idempotencyKey,
        runtimeSettings,
        episodeId: episode.id,
        objective: modelMessage,
        visionAttachments,
        workflowRunId: workflowRun.id,
      }
    }
    const persistAssistantMessage = async (response: Awaited<ReturnType<typeof runDirectorAgent>>) => {
      // Read after the run, so the button offers the step the workspace is on
      // once this run's writes have landed.
      const nextStep = await nextStepBlock(context, projectId, episode.id, parseTargetShotNumbers(body.message))
      const timeline = nextStep ? [...response.timeline, nextStep] : response.timeline
      const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, workflow_run_id: workflowRun.id, role: "assistant", content: response.content, tool_calls: response.toolCalls, suggested_actions: response.suggestedActions, timeline_blocks: timeline, timeline_version: 1 }).select().single()
      if (assistantError) throw assistantError
      return { sessionId, userMessage, assistantMessage, provider: model.startsWith("gemini") ? "google" : "openai", model, usage: response.usage }
    }

    // A non-streaming client still gets the single JSON body it expects.
    if (!body.stream) {
      const workflow = await runWorkflow()
      if (workflow) return NextResponse.json(await persistWorkflowMessage(workflow))
      return NextResponse.json(await persistAssistantMessage(await runDirectorAgent(await buildAgentInput())))
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { /* client went away */ }
        }
        try {
          send({ type: "start", sessionId })
          const workflow = await runWorkflow((label) => send({ type: "tool", tool: "workflow", label, status: "running" }))
          if (workflow) {
            send({ type: "done", ...(await persistWorkflowMessage(workflow)) })
            return
          }
          const response = await runDirectorAgent({ ...(await buildAgentInput()), onEvent: send })
          send({ type: "done", ...(await persistAssistantMessage(response)) })
        } catch (error) {
          console.error("DIRECTOR CHAT STREAM ERROR:", error)
          const failure = describeError(error, "AI Director chat failed")
          // The browser holding this stream sees the error, but a browser that
          // reloaded sees only the run — and an unfinished run reads as one
          // still working. Write the ending here so the failure survives the
          // page that was watching it.
          await recordFailedRun(context, { runId: workflowRun.id, sessionId, message: failure })
          send({ type: "error", error: failure })
        } finally {
          controller.close()
        }
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
 * "Skip shot 6 and continue with the rest of the production."
 *
 * Answered here because the pipeline already knows what comes next, and because
 * left to the agent it came back as a read-only inspection report on an
 * unrelated shot. Skipping changes nothing in the workspace — it only says which
 * shot not to offer — so there is nothing to propose and nothing to approve.
 */
async function maybeHandleSkipShot(input: WorkflowRequestInput, normalized: string) {
  if (!/\bskip\b/.test(normalized)) return null
  const numbers = parseTargetShotNumbers(input.message)
  if (!numbers.length) return null

  const snapshot = withSkippedShots(
    await loadProductionSnapshot(input.context.supabase, input.projectId, input.episodeId),
    numbers,
  )
  const stage = computePipelineStage(snapshot)
  const skippedLabel = `shot ${numbers.join(", ")}`
  const content = stage.nextAction
    ? `Leaving ${skippedLabel} as ${numbers.length === 1 ? "it is" : "they are"}. ${stage.summary} ${stage.nextAction.label} is the next step — nothing has been generated and no credits were spent on the skip.`
    : `Leaving ${skippedLabel} as ${numbers.length === 1 ? "it is" : "they are"}. ${stage.summary}`

  return {
    provider: "workflow",
    result: { type: "skipped_shots", shots: numbers, stage: stage.key },
    message: {
      session_id: input.sessionId,
      role: "assistant",
      content,
      // Carried on the message because the shared next-step block filters itself
      // against the shots the message names, and here those are the ones being
      // passed over rather than the ones to act on.
      ...(stage.nextAction ? {
        timeline_blocks: [{
          type: "suggested_actions",
          actions: [stage.nextAction, ...stage.alternatives]
            .slice(0, 5)
            .map((action) => ({ ...action, payload: { stage: stage.key, summary: stage.summary } })),
        }],
        timeline_version: 1,
      } : {}),
    },
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
async function recordFailedRun(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
  input: { runId: string; sessionId: string; message: string },
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
    await context.supabase.from("creator_chat_messages").insert({
      session_id: input.sessionId,
      workflow_run_id: input.runId,
      role: "assistant",
      content: `I could not finish that: ${input.message}`,
      timeline_blocks: [{ type: "warning", code: "run_failed", message: input.message, recoverable: true, actions: [] }],
      timeline_version: 1,
    })
  } catch (error) {
    // Reporting the failure must not become a second failure.
    console.warn("Could not record the failed Director run:", error)
  }
}

/** How many frames a helping holds when the user asks for them a few at a time. */
const IMAGE_BATCH_CHUNK = 3

/**
 * "Generate all the shot images."
 *
 * The image path renders exactly one frame, so anything covering more than one
 * shot fell through to the agent, which worked through them one at a time and
 * never put the size of the job in front of the user. A storyboard's worth of
 * frames is a single decision with a single price, so it is answered as one
 * proposal: the card totals every frame in it, and approving is what spends.
 *
 * The whole batch is offered, and so is a helping of three, because a user
 * looking at a fifteen-frame bill often wants to see three come back first.
 */
/**
 * "Regenerate shot 15" — which half of it?
 *
 * A shot is a keyframe and a clip. They cost very differently: the keyframe is
 * a handful of credits, the Seedance 2.5 render is fifty a second, so guessing
 * spends the user's money on an answer they did not give. The two buttons
 * carry the wording the fast paths above already recognise, so a click routes
 * straight to the medium it names.
 */
async function askWhichShotMedium(input: WorkflowRequestInput) {
  const numbers = parseTargetShotNumbers(input.message)
  if (numbers.length !== 1) return null
  const [number] = numbers

  const { data: shot } = await input.context.supabase
    .from("creator_shots")
    .select("id,order_index,prompt,keyframe_image,video_url,video_status")
    .eq("episode_id", input.episodeId)
    .order("order_index", { ascending: true })
    .range(number - 1, number - 1)
    .maybeSingle()
  // An unknown shot, or one with no prompt, has its own answer further down.
  if (!shot || !(typeof shot.prompt === "string" && shot.prompt.trim())) return null

  const hasImage = Boolean(shot.keyframe_image)
  const hasVideo = Boolean(shot.video_url) && shot.video_status === "completed"
  const state = hasImage && hasVideo
    ? "It has both a keyframe and a completed video"
    : hasImage
      ? "It has a keyframe but no completed video"
      : hasVideo
        ? "It has a completed video but no keyframe"
        : "It has neither a keyframe nor a video yet"

  return {
    provider: "workflow",
    result: { type: "text" },
    message: {
      session_id: input.sessionId,
      role: "assistant",
      content: `Do you want the shot ${number} image or the shot ${number} video? ${state}, and the two cost very differently — so I would rather ask than spend credits on the wrong one.`,
      suggested_actions: [],
      timeline_blocks: [{
        type: "suggested_actions",
        actions: [
          {
            id: `redo-shot-${number}-image`,
            label: `Regenerate the shot ${number} image`,
            intent: `Regenerate the storyboard keyframe image for shot ${number}.`,
            risk: "costly" as const,
            recommended: false,
            payload: {},
          },
          {
            id: `redo-shot-${number}-video`,
            label: `Regenerate the shot ${number} video`,
            intent: `Regenerate the video for shot ${number}.`,
            risk: "costly" as const,
            recommended: false,
            payload: {},
          },
        ],
      }],
      timeline_version: 1,
    },
  }
}

async function maybeHandleShotImageBatch(input: WorkflowRequestInput, normalized: string) {
  if (!/\b(image|keyframe|poster|visual)s?\b/.test(normalized)) return null
  const intent = parseShotImageBatchIntent(input.message)
  if (!intent) return null

  const { data: shots, error } = await input.context.supabase
    .from("creator_shots")
    .select("id,order_index,title,prompt,keyframe_image,referenced_entities,aspect_ratio")
    .eq("episode_id", input.episodeId)
    .order("order_index")
  if (error) throw error
  if (!shots?.length) return textMessage(input.sessionId, "This episode has no storyboard shots yet, so there is nothing to render frames for.")

  const numberOf = (shot: { order_index: number }) => shot.order_index + 1
  const withPrompt = shots.filter((shot) => typeof shot.prompt === "string" && shot.prompt.trim())
  const redo = wantsRedo(input.message)
  // A frame that already exists is not work unless the user asked to redo it,
  // and re-rendering an approved keyframe costs money and loses the approval.
  const queue = redo ? withPrompt : withPrompt.filter((shot) => !shot.keyframe_image)

  const selected = intent.numbers.length
    ? withPrompt.filter((shot) => intent.numbers.includes(numberOf(shot)))
    : intent.chunk
      ? queue.slice(0, intent.chunk)
      : queue
  if (!selected.length) {
    if (intent.numbers.length) return textMessage(input.sessionId, `I could not find shot ${intent.numbers.join(", ")} with a saved prompt in this episode. It has ${shots.length} shot${shots.length === 1 ? "" : "s"}.`)
    if (!withPrompt.length) return textMessage(input.sessionId, "None of this episode's shots have a saved prompt yet, so there is nothing to render from. Write the prompt sheet first.")
    return textMessage(input.sessionId, `Every shot with a prompt already has a keyframe — ${withPrompt.length} of ${shots.length}. Ask me to regenerate them if you want new frames.`)
  }

  const selectedNumbers = selected.map(numberOf)
  const style = projectVisualStyle(input.context.project)
  const projectDefaultAspect = typeof input.context.project.default_aspect === "string" ? input.context.project.default_aspect : null
  const { data: projectEntities } = await input.context.supabase.from("creator_entities").select("*").eq("project_id", input.projectId)
  const entities = (projectEntities || []) as ResolvedMention[]
  // A shot whose prompt never restates the location was stored without one, and
  // rendering it with no location is what put an apartment scene in a field —
  // with nothing else to go on the model borrows the background from whichever
  // reference photo it has. The scene runs on from the shot before it.
  const located = await ensureShotLocations(input.context.supabase, { shots, entities })
  const castById = new Map(entities.map((entity) => [entity.id, entity]))

  // Built per shot rather than once for the batch: the reference art belongs to
  // the shot's own cast, and one shared prompt would put every character in the
  // episode into every frame.
  const prompts = Object.fromEntries(selected.map((shot) => {
    const aspectRatio = shot.aspect_ratio || projectDefaultAspect || "9:16"
    const shotCast = ((shot.referenced_entities || []) as string[]).map((id) => castById.get(id)).filter((entity): entity is ResolvedMention => Boolean(entity))
    const mentionContext = buildEntityMentionContext([
      ...input.mentionedEntities,
      ...shotCast.filter((entity) => !input.mentionedEntities.some((mentioned) => mentioned.id === entity.id)),
    ])
    return [String(numberOf(shot)), [
      stripIdentityDescriptions(shot.prompt as string),
      `Required composition: ${aspectRatio}.`,
      `Required project style: ${style}.`,
      visualStyleDirective(style),
      mentionContext,
    ].filter(Boolean).join("\n\n")]
  }))

  input.onProgress?.(`Preparing ${selected.length} storyboard frame${selected.length === 1 ? "" : "s"}`)
  const result = await requestDirectorTool(input.context, {
    tool: "submit_generation",
    input: {
      request: {
        type: "image",
        shotNumbers: selectedNumbers,
        episodeId: input.episodeId,
        mentionedEntityIds: input.mentionedEntities.map((entity) => entity.id),
        preference: "balanced",
        aspectRatio: selected[0].aspect_ratio || projectDefaultAspect || "9:16",
        useExistingFrame: false,
      },
      prompts,
      idempotencyKey: `${input.idempotencyKey}:image-batch`,
    },
    sessionId: input.sessionId,
    workflowRunId: input.workflowRunId,
    idempotencyKey: `${input.idempotencyKey}:image-batch-proposal`,
  })

  const remaining = queue.filter((shot) => !selectedNumbers.includes(numberOf(shot)))
  const skipped = withPrompt.length - queue.length
  const alreadyDone = !redo && skipped > 0
    ? ` ${skipped} shot${skipped === 1 ? " already has its frame and was" : "s already have their frames and were"} left alone.`
    : ""
  const unprompted = shots.length - withPrompt.length
  const noPrompt = unprompted > 0 ? ` ${unprompted} shot${unprompted === 1 ? " has" : "s have"} no prompt yet, so ${unprompted === 1 ? "it is" : "they are"} not in this batch.` : ""
  const heading = selected.length === 1
    ? `Ready to render the frame for shot ${selectedNumbers[0]}.`
    : `Ready to render ${selected.length} storyboard frames — shot ${selectedNumbers.join(", ")}. The card shows the total for all ${selected.length}; nothing is charged until you approve it.`
  // Said out loud because it changes what the frames will look like, and the
  // user is about to pay for them.
  const locatedNumbers = selected.filter((shot) => located.has(shot.id)).map(numberOf)
  const locationNote = locatedNumbers.length
    ? ` Shot ${locatedNumbers.join(", ")} named no location, so ${locatedNumbers.length === 1 ? "it carries" : "they carry"} the scene forward from the shot before.`
    : ""

  // Offered beside the full batch rather than instead of it: three frames back
  // is how a user checks the look before committing to the rest.
  const actions = [
    ...(remaining.length ? [{
      id: "image-batch-next-chunk",
      label: `Render ${Math.min(IMAGE_BATCH_CHUNK, remaining.length)} more instead`,
      intent: `Generate the storyboard keyframe images for the next ${Math.min(IMAGE_BATCH_CHUNK, remaining.length)} shots that still need one.`,
      risk: "costly" as const,
      recommended: false,
      payload: {},
    }] : []),
    ...(!intent.chunk && selected.length > IMAGE_BATCH_CHUNK ? [{
      id: "image-batch-first-chunk",
      label: `Start with ${IMAGE_BATCH_CHUNK} instead`,
      intent: `Generate the storyboard keyframe images for the first ${IMAGE_BATCH_CHUNK} shots that still need one.`,
      risk: "costly" as const,
      recommended: false,
      payload: {},
    }] : []),
  ]

  const proposal = typeof result === "object" && result && "proposal" in result ? (result as { proposal?: unknown }).proposal : null
  return {
    provider: "workflow",
    result,
    message: {
      session_id: input.sessionId,
      role: "assistant",
      content: `${heading}${locationNote}${alreadyDone}${noPrompt}${remaining.length ? ` ${remaining.length} shot${remaining.length === 1 ? "" : "s"} would still be waiting after this.` : ""}`,
      suggested_actions: proposal ? [{ type: "proposal", proposal }] : [],
      // Carried on the message so the shared next-step block does not replace
      // the choice this batch is offering with a single-shot step.
      ...(actions.length ? { timeline_blocks: [{ type: "suggested_actions", actions }], timeline_version: 1 } : {}),
    },
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
): Promise<DirectorTimelineBlock | null> {
  try {
    const stage = computePipelineStage(await loadProductionSnapshot(context.supabase, projectId, episodeId))
    if (!stage.nextAction) return null
    // The primary step first, then the moves that make sense beside it: film the
    // shot whose frame was just approved, or redo the frame. Each is judged on
    // its own against the shots this turn was about — dropping the whole block
    // because the headline step moved on to the next shot took the steps for
    // *this* shot down with it. The schema caps this at five.
    const actions = [stage.nextAction, ...stage.alternatives]
      .filter((action) => actionMatchesRequestedShots(action.intent, requestedShotNumbers))
      .slice(0, 5)
    if (!actions.length) return null
    return {
      type: "suggested_actions",
      actions: actions.map((action) => ({ ...action, payload: { stage: stage.key, summary: stage.summary } })),
    }
  } catch (error) {
    // A reply that lost its next-step button is still a reply. Failing the whole
    // run over the button would lose the work the run just did.
    console.warn("Could not build the pipeline next step:", error)
    return null
  }
}

async function buildWorkflowInstructions(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, episodeId: string, sessionId: string, baseInstructions: string) {
  const workflows = await fetchDirectorWorkflows(context.supabase)
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
  const uploadContext = await recentUploadContext(context, sessionId)
  const projectState = await buildProjectStateSummary(context.supabase, context.project.id, episodeId)
  // The other episodes and where each one's footage ends. Without it the agent
  // knows only the episode it is standing in, so a request to carry a shot over
  // from an earlier one had no id to look anything up with.
  const episodeContext = await fetchEpisodeFootage(context.supabase, context.project.id)
    .then((footage) => episodeFootageInstructions(footage, episodeId))
    .catch((error) => { console.warn("Could not read the project's episodes:", error); return "" })
  const workflowLines = workflow ? [
    "Selected AI Director workflow:",
    `Workflow: ${workflow.title} (${workflow.id})`,
    `Workflow skill: ${workflow.skill || "Not specified"}`,
    `Workflow instructions: ${workflow.instructions || workflow.description || "Follow the selected workflow."}`,
  ] : []
  return [
    baseInstructions,
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

type ResolvedMention = MentionableEntity & { metadata?: Record<string, unknown> }

type WorkflowRequestInput = {
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>
  projectId: string
  episodeId: string
  sessionId: string
  workflowRunId: string
  message: string
  history: { role: string; content: string | null }[]
  idempotencyKey: string
  mentionedEntities: ResolvedMention[]
  /** Reports what the fast path is doing while it does it, so the chat can say so. */
  onProgress?: (label: string) => void
}

async function maybeHandleWorkflowRequest(input: WorkflowRequestInput) {
  const normalized = input.message.toLowerCase()
  const forbidsAllMediaGeneration = forbidsMediaGeneration(input.message)
  const forbidsImageGenerationRequest = forbidsImageGeneration(input.message)
  const forbidsVideoGenerationRequest = forbidsVideoGeneration(input.message)
  const scriptIntent = await maybeHandleScriptWrite(input, normalized)
  if (scriptIntent) return scriptIntent
  const cleanup = await maybeCleanSavedPrompts(input, normalized)
  if (cleanup) return cleanup
  const skipped = await maybeHandleSkipShot(input, normalized)
  if (skipped) return skipped
  if (/\b(full auto|full-auto|autopilot)\b/.test(normalized) && /\b(enable|turn on|start|activate)\b/.test(normalized)) {
    const result = await requestDirectorTool(input.context, {
      tool: "update_full_auto_mode",
      input: { enabled: true, creditCap: 500, maxJobsPerRun: 10, allowDestructiveActions: false },
      sessionId: input.sessionId,
      workflowRunId: input.workflowRunId,
      idempotencyKey: `${input.idempotencyKey}:full-auto`,
    })
    return proposalMessage(input.sessionId, "I prepared a full-auto mode proposal with credit and job guardrails. Approve it here before I can run the workflow automatically.", result)
  }
  const bulkEntityImageIntent = !forbidsAllMediaGeneration && !forbidsImageGenerationRequest ? parseBulkEntityImageIntent(input.message, input.mentionedEntities) : null
  if (bulkEntityImageIntent) return generateBulkEntityReferenceImages(input, bulkEntityImageIntent)
  // "recreate the shot 6 video" is a video request; it just never says the word
  // "generate". Left to the agent it came back as an inspection report on a
  // different shot entirely.
  const wantsMediaVerb = /\b(generate|create|make|render|produce)\b/.test(normalized) || wantsRedo(normalized)
  if (!forbidsAllMediaGeneration && !forbidsVideoGenerationRequest && /\b(video|animate|motion)\b/.test(normalized) && wantsMediaVerb) {
    const { data: shots, error } = await input.context.supabase.from("creator_shots").select("id,prompt,title,order_index,keyframe_image,video_url,video_status,duration_seconds,metadata").eq("episode_id", input.episodeId).order("order_index")
    if (error) throw error
    // Same 1-based numbering submit_generation resolves against, so a number
    // reported back here is the number the tool will target.
    const byNumber = new Map((shots ?? []).map((shot) => [shot.order_index + 1, shot]))
    const videoIntent = parseVideoShotReferenceIntent(input.message)
    const requestedNumbers = videoIntent.targetShotNumbers
    const referenceNumbers = videoIntent.referenceShotNumbers
    const missing = requestedNumbers.filter((number) => !byNumber.has(number))
    if (requestedNumbers.length && missing.length === requestedNumbers.length) {
      return textMessage(input.sessionId, `This episode has ${(shots ?? []).length} shot${(shots ?? []).length === 1 ? "" : "s"}, so I could not find shot ${missing.join(", ")}.`)
    }
    // A named shot without a prompt is the user's to fix: generating from a
    // neighbouring shot's prompt would silently render something else.
    const named = requestedNumbers.filter((number) => byNumber.get(number)?.prompt)
    const unprompted = requestedNumbers.filter((number) => byNumber.has(number) && !byNumber.get(number)?.prompt)
    if (requestedNumbers.length && !named.length) {
      return textMessage(input.sessionId, `Shot ${unprompted.join(", ")} has no prompt yet. Add one to the storyboard and I will prepare the video.`)
    }
    const selectedNumbers = named.length ? named : (shots ?? []).filter((shot) => shot.prompt).slice(0, 3).map((shot) => shot.order_index + 1)
    if (!selectedNumbers.length) return textMessage(input.sessionId, "I need at least one storyboard shot with a prompt before I can prepare video generation.")
    const missingReferenceNumbers = referenceNumbers.filter((number) => {
      const shot = byNumber.get(number)
      return !shot?.video_url || shot.video_status !== "completed"
    })
    if (missingReferenceNumbers.length) {
      return textMessage(input.sessionId, `Shot ${missingReferenceNumbers.join(", ")} does not have a completed video yet, so I cannot use it as a continuity reference.`)
    }
    // Under a continuity workflow, "generate shot 3 video" means continue from
    // shot 2 — the user chose that workflow precisely so they would not have to
    // name the reference on every shot. Without this the selected workflow only
    // reached the model as advice, and a plain request rendered the shot cold.
    const workflowId = selectedWorkflowId(input.context.project, input.episodeId)
    const previousNumber = selectedNumbers.length === 1 ? selectedNumbers[0] - 1 : 0
    const previousShot = previousNumber > 0 ? byNumber.get(previousNumber) : undefined
    const previousClipReady = Boolean(previousShot?.video_url && previousShot.video_status === "completed")
    const inheritsPreviousClip = !referenceNumbers.length
      && workflowContinuesFromPreviousClip(workflowId)
      && previousClipReady
    const activeReferenceNumbers = inheritsPreviousClip ? [previousNumber] : referenceNumbers
    // The first shot of an episode has no previous shot to continue from inside
    // its own storyboard, but the story does not restart there — it carries on
    // from where the last episode ended. Without this every episode opened cold.
    // It is only ever proposed: the reply below names the episode and shot it
    // reached for, and the approval card is still the gate.
    const opensTheEpisode = selectedNumbers.length === 1 && selectedNumbers[0] === 1
    const handoff = !referenceNumbers.length && opensTheEpisode && workflowContinuesFromPreviousClip(workflowId)
      ? previousEpisodeHandoff(await fetchEpisodeFootage(input.context.supabase, input.projectId), input.episodeId)
      : null
    const videoReferencePaths = handoff
      ? [handoff.videoPath]
      : activeReferenceNumbers
        .map((number) => byNumber.get(number)?.video_url)
        .filter((path): path is string => Boolean(path))
    const explicitContinuation = Boolean(handoff) || activeReferenceNumbers.length > 0
    const style = projectVisualStyle(input.context.project)
    const prompts = Object.fromEntries(selectedNumbers.map((number) => {
      const shot = byNumber.get(number)!
      // The shot's video prompt when it has one — the timed beats of what
      // happens across the runtime. Its image prompt describes a single frame,
      // so filming from that is what made clips read as a drifting still.
      const basePrompt = videoPromptFor(shot)
      return [String(number), explicitContinuation
        ? buildVideoContinuationPrompt({
            targetShotNumber: number,
            referenceShotNumber: handoff ? undefined : activeReferenceNumbers[0],
            referenceAlias: handoff ? handoffAlias(handoff) : undefined,
            basePrompt,
            style,
          })
        : basePrompt]
    }))
    // The target keyframe is a composition input only for this explicit
    // continuation workflow. The previous clip supplies motion continuity;
    // the target frame supplies the next shot's layout.
    const targetKeyframes = explicitContinuation
      ? selectedNumbers.map((number) => byNumber.get(number)?.keyframe_image).filter((path): path is string => Boolean(path))
      : []
    input.onProgress?.(`Preparing video for shot ${selectedNumbers.join(", ")}`)
    const result = await requestDirectorTool(input.context, {
      tool: "submit_generation",
      input: {
        // Numbers rather than ids: the tool resolves them against the episode,
        // so the proposal card and the job target the same shot even if the
        // storyboard is reordered between proposing and approving.
        request: {
          type: "video",
          shotNumbers: selectedNumbers,
          episodeId: input.episodeId,
          mentionedEntityIds: input.mentionedEntities.map((entity) => entity.id),
          preference: "balanced",
          // A shot runs as long as what happens in it. This was pinned at four
          // seconds whatever the shot said, so a shot set to ten still rendered
          // four and cut its own dialogue off mid-sentence. One request renders
          // one runtime, so a batch takes the longest shot in it.
          durationSeconds: Math.max(...selectedNumbers.map((number) => {
            const shot = byNumber.get(number)
            if (!shot) return 4
            // Beats are the runtime where they exist: a prompt that scripts
            // eight seconds rendered at four loses its last beat outright.
            return beatRuntimeSeconds(videoPromptFor(shot)) ?? resolveShotSeconds(shot)
          })),
          videoReferenceShotNumbers: activeReferenceNumbers,
          videoReferencePaths,
          referencePaths: targetKeyframes,
          useExistingFrame: explicitContinuation && targetKeyframes.length > 0,
          generationMode: explicitContinuation ? "multi_image" : "keyframe",
        },
        prompts,
        idempotencyKey: `${input.idempotencyKey}:video`,
      },
      sessionId: input.sessionId,
      workflowRunId: input.workflowRunId,
      idempotencyKey: `${input.idempotencyKey}:video-proposal`,
    })
    const skipped = unprompted.length ? ` Shot ${unprompted.join(", ")} has no prompt yet, so I left ${unprompted.length === 1 ? "it" : "them"} out.` : ""
    const continuity = handoff
      // Named in full: a clip carried in from another episode is the one
      // reference the user cannot check against this storyboard.
      ? ` continuing from the last rendered shot of ${handoff.episodeName} (shot ${handoff.shotNumber}), because this is the first shot of the episode`
      : activeReferenceNumbers.length
      ? ` using shot ${activeReferenceNumbers.join(", ")}'s completed video as the continuity reference${inheritsPreviousClip ? " (this project's workflow continues from the previous clip)" : ""}`
      : previousNumber > 0 && workflowContinuesFromPreviousClip(workflowId)
        ? ` from its reference images only, because shot ${previousNumber} has no completed video yet to continue from`
        : ""
    return proposalMessage(input.sessionId, `Video generation is ready for shot ${selectedNumbers.join(", ")}${continuity}.${skipped} Review and approve before credits are reserved.`, result)
  }
  const imageBatch = !forbidsAllMediaGeneration && !forbidsImageGenerationRequest && wantsMediaVerb
    ? await maybeHandleShotImageBatch(input, normalized)
    : null
  if (imageBatch) return imageBatch
  // "regenerate shot 15" names a shot but not which half of it. Guessing the
  // keyframe was cheap but still a guess, and a user who meant the clip paid
  // for a frame they never asked for. Ask instead.
  const ambiguousRedo = !forbidsAllMediaGeneration && isAmbiguousShotRedo(input.message)
    ? await askWhichShotMedium(input)
    : null
  if (ambiguousRedo) return ambiguousRedo
  // "regenerate shot 1" names no medium, and left to the agent it resolved to a
  // different shot entirely. A named shot with a redo verb is unambiguous enough
  // to answer here once the medium is settled — either the user named it, or
  // the question above did.
  const wantsShotRedo = wantsRedo(normalized) && parseTargetShotNumbers(input.message).length > 0
  const namesImage = /\b(image|keyframe|poster|visual)\b/.test(normalized) && /\b(generate|create|make|draw)\b/.test(normalized)
  if (!forbidsAllMediaGeneration && !forbidsImageGenerationRequest && (namesImage || wantsShotRedo)) {
    const shotNumberMatch = normalized.match(/\b(?:storyboard\s+)?shots?\s*(?:#\s*)?(\d+)\b/)
    const requestedShotNumber = shotNumberMatch ? Number(shotNumberMatch[1]) : /\bfirst\s+(?:storyboard\s+)?shot\b/.test(normalized) ? 1 : null
    // A message that says "shot" without saying which one needs the
    // conversation to resolve it, and the agent has that context — guessing
    // here would attach the picture to whichever shot happened to be first.
    if (!requestedShotNumber && /\bshots?\b/.test(normalized)) return null
    // "images for shot 8, 9, 10" is a batch. This path renders exactly one
    // shot, and the single-number regex above would silently keep the first and
    // drop the rest, so the batch goes to the agent instead.
    if (parseTargetShotNumbers(input.message).length > 1) return null
    const { data: targetShot } = requestedShotNumber
      ? await input.context.supabase
        .from("creator_shots")
        .select("id,order_index,prompt,aspect_ratio,metadata,referenced_entities")
        .eq("episode_id", input.episodeId)
        .order("order_index", { ascending: true })
        .range(requestedShotNumber - 1, requestedShotNumber - 1)
        .maybeSingle()
      : { data: null }
    const prompt = (typeof targetShot?.prompt === "string" && targetShot.prompt.trim())
      ? targetShot.prompt
      : input.message.replace(/^.*?\b(generate|create|make|draw)\b/i, "").trim() || input.message
    // A shot whose prompt never restates the location was stored without one,
    // and rendering it with no location is what put an apartment scene in a
    // field. Repaired before the cast is read, so the frame is rendered
    // somewhere and the storyboard shows where.
    if (targetShot) {
      const [{ data: episodeShots }, { data: locationEntities }] = await Promise.all([
        input.context.supabase.from("creator_shots").select("id,order_index,referenced_entities,metadata").eq("episode_id", input.episodeId).order("order_index"),
        input.context.supabase.from("creator_entities").select("id,type").eq("project_id", input.projectId),
      ])
      const repaired = await ensureShotLocations(input.context.supabase, { shots: episodeShots || [], entities: locationEntities || [] })
      const location = repaired.get(targetShot.id)
      if (location) targetShot.referenced_entities = Array.from(new Set([...(targetShot.referenced_entities as string[] || []), location]))
    }
    // The shot's own cast, not just the entities the user retyped with @. A
    // "regenerate shot 1" names nobody, and sending no reference art at all is
    // what made the regenerated frame come back with a different face — the one
    // thing the reference library exists to prevent.
    const castIds = Array.isArray(targetShot?.referenced_entities) ? targetShot.referenced_entities as string[] : []
    const { data: castEntities } = castIds.length
      ? await input.context.supabase.from("creator_entities").select("*").eq("project_id", input.projectId).in("id", castIds)
      : { data: [] }
    const referencedEntities = [
      ...input.mentionedEntities,
      ...((castEntities || []) as ResolvedMention[]).filter((entity) => !input.mentionedEntities.some((mentioned) => mentioned.id === entity.id)),
    ]
    const mentionContext = buildEntityMentionContext(referencedEntities)
    const style = projectVisualStyle(input.context.project)
    const projectDefaultAspect = typeof input.context.project.default_aspect === "string" ? input.context.project.default_aspect : null
    const aspectRatio = targetShot?.aspect_ratio || projectDefaultAspect || "9:16"
    const resolvedPrompt = [stripIdentityDescriptions(prompt), `Required composition: ${aspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
    // The chosen image for each entity, never the rejected attempts sitting
    // beside it. GPT Image takes 16 references, so the budget is spent on
    // subjects rather than on second opinions about one subject.
    const referencePaths = chosenReferences(referencedEntities, 16)
    const referenceUrls = await signedMentionReferences(input.context, referencePaths)
    const quality = projectImageQuality(input.context.project)
    const creditCost = calculateCreditCost("gpt-image-2", "image", 5, { quality, aspectRatio })
    const deduction = await deductUserCredits(
      input.context.user.id,
      creditCost,
      "gpt-image-2",
      "AI Director chat image generation",
      input.context.supabase,
    )
    if (!deduction.success) throw new OpenAIProviderError(deduction.errorMessage || "Insufficient credits", 402)
    const requestedAt = new Date().toISOString()
    const targetSnapshot = targetShot
      ? buildGenerationTargetSnapshot({ projectId: input.projectId, episodeId: input.episodeId, shotId: targetShot.id, shotNumber: requestedShotNumber, type: "image", prompt, entityReferenceIds: referencedEntities.map((entity) => entity.id), createdAt: requestedAt })
      : null
    const { data: generationJob, error: generationJobError } = await input.context.supabase.from("creator_generation_jobs").insert({
      user_id: input.context.user.id,
      project_id: input.projectId,
      episode_id: targetShot ? input.episodeId : null,
      workflow_run_id: input.workflowRunId,
      session_id: input.sessionId,
      shot_id: targetShot?.id || null,
      type: "image",
      status: "approved",
      model: "gpt-image-2",
      provider: "openai",
      prompt,
      input_images: referencePaths,
      settings: { target: targetShot ? "shot" : "chat", shotId: targetShot?.id || null, style, aspectRatio, quality },
      target_snapshot: targetSnapshot,
      estimated_credits: creditCost,
      credits_used: 0,
      requires_approval: false,
      approved_at: requestedAt,
    }).select("id").single()
    if (generationJobError) throw generationJobError
    await input.context.supabase.from("creator_generation_jobs").update({ status: "processing", credits_used: creditCost, started_at: new Date().toISOString() }).eq("id", generationJob.id)
    const refundKey = `generation-job:${generationJob.id}`
    try {
    input.onProgress?.(requestedShotNumber ? `Generating the keyframe for shot ${requestedShotNumber}` : "Generating the image")
    const image = await generateOpenAIImage({ userId: input.context.user.id, model: "gpt-image-2", prompt: resolvedPrompt, referenceUrls, aspectRatio, quality: openAIImageQuality(quality) })
    input.onProgress?.(requestedShotNumber ? `Saving the keyframe to shot ${requestedShotNumber}` : "Saving the image")
    const path = `${input.context.user.id}/${input.projectId}/chat/${crypto.randomUUID()}.png`
    const { error: uploadError } = await input.context.supabase.storage.from("creator-studio-media").upload(path, image, { contentType: "image/png", upsert: false })
    if (uploadError) throw uploadError
    if (targetShot) {
      const currentMetadata = targetShot.metadata && typeof targetShot.metadata === "object" ? targetShot.metadata as Record<string, unknown> : {}
      const completedAt = new Date().toISOString()
      const { error: shotUpdateError } = await input.context.supabase.from("creator_shots").update({
        keyframe_image: path,
        referenced_entities: Array.from(new Set([...(targetShot.referenced_entities || []), ...referencedEntities.map((entity) => entity.id)])),
        metadata: {
          ...currentMetadata,
          image_generation: { provider: "openai", model: "gpt-image-2", prompt, resolved_prompt: resolvedPrompt, reference_images: referencePaths, mentioned_entity_ids: input.mentionedEntities.map((entity) => entity.id), status: "completed", completed_at: completedAt },
        },
      }).eq("id", targetShot.id)
      if (shotUpdateError) throw shotUpdateError
      const { data: verifiedShot, error: verifyError } = await input.context.supabase.from("creator_shots").select("id,episode_id,keyframe_image,referenced_entities").eq("id", targetShot.id).maybeSingle()
      if (verifyError) throw verifyError
      const verificationResult = verifyGenerationTarget({ target: targetSnapshot!, actual: { shotId: verifiedShot?.id || "", episodeId: verifiedShot?.episode_id || null, prompt, entityReferenceIds: verifiedShot?.referenced_entities || [], resultPath: verifiedShot?.keyframe_image || null }, expectedResultPath: path })
      if (!verificationResult.ok) throw new Error(`Generation verification failed: ${Object.entries(verificationResult.checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`)
      const { error: historyError } = await input.context.supabase.from("creator_generation_jobs").update({
        status: "completed",
        result_url: path,
        verification: { status: "verified", checkedAt: new Date().toISOString(), checks: verificationResult.checks, resultPath: path },
        completed_at: completedAt,
        credits_used: creditCost,
      }).eq("id", generationJob.id)
      if (historyError) throw historyError
    } else {
      const { error: historyError } = await input.context.supabase.from("creator_generation_jobs").update({
        status: "completed",
        result_url: path,
        completed_at: new Date().toISOString(),
        credits_used: creditCost,
      }).eq("id", generationJob.id)
      if (historyError) throw historyError
    }
    const { data: signed } = await input.context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    return {
      provider: "openai",
      result: {
        type: "image",
        path,
        shotId: targetShot?.id || null,
        creditsCharged: creditCost,
        creditBalance: deduction.newBalance,
      },
      message: {
        session_id: input.sessionId,
        role: "assistant",
        content: targetShot
          ? `Generated one GPT Image 2 keyframe and attached it to storyboard shot ${requestedShotNumber}.`
          : "Generated the image and attached it here for review.",
        referenced_entity_ids: referencedEntities.map((entity) => entity.id),
        media: [{ type: "image", path, url: signed?.signedUrl, prompt, referencedEntityIds: referencedEntities.map((entity) => entity.id), provider: "openai", model: "gpt-image-2" }],
      },
    }
    } catch (error) {
      await refundGenerationCredits(input.context.user.id, creditCost, refundKey, "Refund: failed AI Director image generation", generationJob.id, input.context.supabase)
      await input.context.supabase.from("creator_generation_jobs").update({
        status: "failed",
        error: error instanceof Error ? error.message : "Image generation failed",
        completed_at: new Date().toISOString(),
      }).eq("id", generationJob.id)
      throw error
    }
  }
  return null
}

async function generateBulkEntityReferenceImages(
  input: WorkflowRequestInput,
  intent: BulkEntityImageIntent,
) {
  const { data: entities, error } = await input.context.supabase
    .from("creator_entities")
    .select("*")
    .eq("project_id", input.projectId)
    .in("type", intent.types)
    .order("created_at")
  if (error) throw error

  let requested = (entities || []).filter((entity) => intent.regenerate || !Array.isArray(entity.reference_images) || entity.reference_images.length === 0)
  if (intent.entityIds && intent.entityIds.length > 0) {
    requested = (entities || []).filter((entity) => intent.entityIds?.includes(entity.id))
  }
  if (!requested.length) {
    // "All of them already have images" is vacuously true when the project has
    // none at all, which turned "create characters from the script" into a
    // refusal on an empty project. With nothing to image, hand back to the
    // Director so it can read the script and create the entities first.
    if (!(entities || []).length) return null
    const label = intent.types.length === 1 && intent.types[0] === "character" ? "characters" : "characters and assets"
    return textMessage(input.sessionId, `All matching ${label} already have reference images. Say “regenerate all” if you want to replace or refresh them.`)
  }

  const style = projectVisualStyle(input.context.project)
  const quality = projectImageQuality(input.context.project)
  const completed: Array<{ entityId: string; entityName: string; path: string; url?: string; prompt: string }> = []
  const failed: Array<{ entityName: string; error: string }> = []
  let creditsCharged = 0
  let creditBalance: number | null = null
  const batchSize = 3

  for (let offset = 0; offset < requested.length; offset += batchSize) {
    const batch = requested.slice(offset, offset + batchSize)
    input.onProgress?.(`Generating reference art: ${batch.map((entity) => entity.name).join(", ")} (${offset + 1}–${Math.min(offset + batch.length, requested.length)} of ${requested.length})`)
    const results = await Promise.allSettled(batch.map(async (entity) => {
      const prompt = buildEntityReferenceImagePrompt(entity as MentionableEntity, style)
      const existingReferences = Array.isArray(entity.reference_images) ? entity.reference_images.slice(0, 3) : []
      const referenceUrls = await signedMentionReferences(input.context, existingReferences)
      const creditCost = calculateCreditCost("gpt-image-2", "image", 5, { quality, aspectRatio: "2:3" })
      const deduction = await deductUserCredits(
        input.context.user.id,
        creditCost,
        "gpt-image-2",
        `AI Director character/asset reference: ${entity.name}`,
        input.context.supabase,
      )
      if (!deduction.success) throw new OpenAIProviderError(deduction.errorMessage || "Insufficient credits", 402)
      const { data: generationJob, error: generationJobError } = await input.context.supabase.from("creator_generation_jobs").insert({
        user_id: input.context.user.id,
        project_id: input.projectId,
        session_id: input.sessionId,
        workflow_run_id: input.workflowRunId,
        type: "image",
        status: "approved",
        model: "gpt-image-2",
        provider: "openai",
        prompt,
        input_images: existingReferences,
        settings: { target: "asset", entityId: entity.id, entityType: entity.type, style, aspectRatio: "2:3", quality },
        requires_approval: false,
        estimated_credits: creditCost,
        credits_used: 0,
        approved_at: new Date().toISOString(),
      }).select("id").single()
      if (generationJobError) throw generationJobError
      await input.context.supabase.from("creator_generation_jobs").update({ status: "processing", credits_used: creditCost, started_at: new Date().toISOString() }).eq("id", generationJob.id)
      const refundKey = `generation-job:${generationJob.id}`
      try {
      const image = await generateOpenAIImage({ userId: input.context.user.id, model: "gpt-image-2", prompt, referenceUrls, aspectRatio: "2:3", quality: openAIImageQuality(quality) })
      const path = `${input.context.user.id}/${input.projectId}/entities/${entity.id}/gpt-image-2-${crypto.randomUUID()}.png`
      const { error: uploadError } = await input.context.supabase.storage.from("creator-studio-media").upload(path, image, { contentType: "image/png", upsert: false })
      if (uploadError) throw uploadError

      const completedAt = new Date().toISOString()
      const currentMetadata = entity.metadata && typeof entity.metadata === "object" ? entity.metadata as Record<string, unknown> : {}
      let byteplusAssetId: string | null = null
      const { data: signedOutput } = await input.context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
      if (signedOutput?.signedUrl && process.env.ARK_ACCESS_KEY && process.env.ARK_SECRET_KEY) {
        try {
          byteplusAssetId = (await createBytePlusAsset({ imageUrl: signedOutput.signedUrl, name: entity.name })).assetId
        } catch (registrationError) {
          console.warn(`Could not register ${entity.name} as a BytePlus asset:`, registrationError)
        }
      }
      const referenceImages = intent.regenerate ? [path, ...existingReferences.filter((item: string) => item !== path)] : [...existingReferences, path]
      const metadata = {
        ...currentMetadata,
        ...(byteplusAssetId ? { byteplus_asset_id: byteplusAssetId } : {}),
        image_generation: { provider: "openai", model: "gpt-image-2", prompt, style, target: "entity", entity_id: entity.id, status: "completed", completed_at: completedAt },
      }
      const updates: Record<string, unknown> = { reference_images: referenceImages, metadata, status: entity.status || "draft" }
      if (byteplusAssetId) {
        updates.byteplus_asset_id = byteplusAssetId
        updates.byteplus_asset_uri = `asset://${byteplusAssetId}`
        Object.assign(updates, VERIFIED_ASSET)
      }
      const { error: updateError } = await input.context.supabase.from("creator_entities").update(updates).eq("id", entity.id).eq("project_id", input.projectId)
      if (updateError) throw updateError

      await input.context.supabase.from("creator_generation_jobs").update({
        status: "completed",
        result_url: path,
        completed_at: completedAt,
        credits_used: creditCost,
      }).eq("id", generationJob.id)
      creditsCharged += creditCost
      creditBalance = deduction.newBalance
      return { entityId: entity.id, entityName: entity.name, path, url: signedOutput?.signedUrl, prompt }
      } catch (error) {
        await refundGenerationCredits(input.context.user.id, creditCost, refundKey, `Refund: failed reference image for ${entity.name}`, generationJob.id, input.context.supabase)
        await input.context.supabase.from("creator_generation_jobs").update({
          status: "failed",
          error: error instanceof Error ? error.message : "Image generation failed",
          completed_at: new Date().toISOString(),
        }).eq("id", generationJob.id)
        throw error
      }
    }))
    results.forEach((result, index) => {
      if (result.status === "fulfilled") completed.push(result.value)
      else failed.push({ entityName: batch[index].name, error: result.reason instanceof Error ? result.reason.message : "Image generation failed" })
    })
  }

  if (!completed.length) throw new Error(failed[0]?.error || "No entity reference images could be generated")
  const skippedCount = (entities || []).length - requested.length
  const details = [
    `Generated ${completed.length} separate ${style} reference image${completed.length === 1 ? "" : "s"} and saved each one to its matching card in Characters & Assets.`,
    skippedCount ? `${skippedCount} existing reference image${skippedCount === 1 ? " was" : "s were"} kept.` : "",
    failed.length ? `${failed.length} failed: ${failed.map((item) => item.entityName).join(", ")}.` : "",
  ].filter(Boolean).join(" ")
  return {
    provider: "openai",
    result: {
      type: "entity_images",
      generated: completed.length,
      failed,
      entityIds: completed.map((item) => item.entityId),
      style,
      creditsCharged,
      creditBalance,
    },
    message: {
      session_id: input.sessionId,
      role: "assistant",
      content: details,
      referenced_entity_ids: completed.map((item) => item.entityId),
      media: completed.map((item) => ({ type: "image", path: item.path, url: item.url, prompt: item.prompt, entityId: item.entityId, entityName: item.entityName, target: "entity", provider: "openai", model: "gpt-image-2" })),
    },
  }
}

async function signedMentionReferences(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, paths: string[]) {
  const urls: string[] = []
  for (const path of paths) {
    if (/^https?:\/\//i.test(path)) {
      urls.push(path)
      continue
    }
    const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    if (error) throw error
    urls.push(data.signedUrl)
  }
  return urls
}

/**
 * Rewrites the saved storyboard prompts through the identity stripper on
 * request. Generation already strips descriptions on the way to the provider,
 * but the saved prompt is what the user reads and edits, so "fix the prompts"
 * has to change what is stored, not only what is sent.
 */
async function maybeCleanSavedPrompts(input: WorkflowRequestInput, normalized: string) {
  const wantsFix = /\b(fix|clean|cleanup|strip|remove|delete|rewrite)\b/.test(normalized)
  if (!wantsFix) return null
  // Either the message names the identity text directly ("remove the character
  // lock"), or it names both a target and the descriptions ("fix the prompts,
  // drop the character descriptions"). Requiring all three at once meant the
  // ordinary way of asking sailed past this and reached the agent instead.
  const namesTarget = /\b(prompts?|storyboard|shots?|scenes?)\b/.test(normalized)
  const namesIdentityText = /\b(?:character|asset|cast)\s+(?:lock|descriptions?)\b|\bdescriptions?\s+of\s+(?:the\s+)?characters?\b|\bcharacter\s+description\s+remover\b/.test(normalized)
  const namesDescriptions = /\b(descriptions?|identity|likeness|appearance)\b/.test(normalized)
  if (!namesIdentityText && !(namesTarget && namesDescriptions)) return null

  const { data: shots, error } = await input.context.supabase
    .from("creator_shots")
    .select("id,order_index,prompt")
    .eq("episode_id", input.episodeId)
    .order("order_index")
  if (error) throw error

  const requested = parseTargetShotNumbers(input.message)
  const targets = (shots || []).filter((shot) => !requested.length || requested.includes(shot.order_index + 1))
  const cleaned: number[] = []
  for (const shot of targets) {
    const current = typeof shot.prompt === "string" ? shot.prompt : ""
    const next = stripIdentityDescriptions(current)
    if (!current.trim() || next === current) continue
    const { error: updateError } = await input.context.supabase.from("creator_shots").update({ prompt: next }).eq("id", shot.id)
    if (updateError) throw updateError
    cleaned.push(shot.order_index + 1)
  }

  // The prompt sheet is where the storyboard's prompts came from, so leaving it
  // dirty means the block comes back the next time shots are rebuilt from it.
  let cleanedSheetRows = 0
  if (!requested.length) {
    const { data: sheet } = await input.context.supabase
      .from("creator_script_prompts")
      .select("id,prompt")
      .eq("episode_id", input.episodeId)
      .eq("project_id", input.projectId)
    for (const row of sheet || []) {
      const current = typeof row.prompt === "string" ? row.prompt : ""
      const next = stripIdentityDescriptions(current)
      if (!current.trim() || next === current) continue
      const { error: sheetError } = await input.context.supabase.from("creator_script_prompts").update({ prompt: next }).eq("id", row.id)
      if (sheetError) throw sheetError
      cleanedSheetRows += 1
    }
  }

  if (!cleaned.length && !cleanedSheetRows) {
    return textMessage(input.sessionId, requested.length
      ? `Shot ${requested.join(", ")} carries no written character description, so there was nothing to strip.`
      : "None of the saved shot prompts carry a written character description, so there was nothing to strip.")
  }
  const parts = [
    cleaned.length ? `Stripped the written character descriptions from ${cleaned.length} storyboard prompt${cleaned.length === 1 ? "" : "s"} (shot ${cleaned.join(", ")}).` : "",
    cleanedSheetRows ? `Cleaned ${cleanedSheetRows} prompt sheet entr${cleanedSheetRows === 1 ? "y" : "ies"} too, so a storyboard rebuild stays clean.` : "",
    "Each prompt keeps its @mentions, so the cast still resolves and every character is now locked by its reference art instead of by words.",
  ].filter(Boolean)
  return textMessage(
    input.sessionId,
    parts.join(" "),
    { type: "prompts_cleaned", shots: cleaned, sheetEntries: cleanedSheetRows },
  )
}

async function maybeHandleScriptWrite(input: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; episodeId: string; sessionId: string; message: string; history: { role: string; content: string | null }[] }, normalized: string) {
  const wantsScriptWrite = /\b(script|screenplay|scene|sequence)\b/.test(normalized)
  const wantsAdd = /\b(add|append|put|insert|save)\b/.test(normalized)
  const wantsReplace = /\b(replace|overwrite|supersede)\b/.test(normalized)
  const confirmsReplace = /\b(yes|confirm|confirmed|do it|ok|okay)\b/.test(normalized) && /\b(replace|current script)\b/.test(normalized)
  if ((!wantsScriptWrite || (!wantsAdd && !wantsReplace)) && !confirmsReplace) return null

  const sourceMessage = confirmsReplace
    ? [...input.history].reverse().find((item) => item.role === "user" && item.content && /\b(add|replace|append|put|insert|save)\b.*\b(script|screenplay|scene|sequence)\b/i.test(item.content))?.content || ""
    : input.message
  const extracted = extractScriptText(sourceMessage)
  if (!looksLikeScript(extracted)) return null

  const { data: episode, error } = await input.context.supabase
    .from("creator_episodes")
    .select("script_content")
    .eq("id", input.episodeId)
    .single()
  if (error) throw error

  const current = parseStoredScript(episode?.script_content)
  const nextScriptBlock = scriptTextToFullScript(extracted)
  const shouldReplace = wantsReplace || confirmsReplace || (!current.body.trim() && !current.overview.trim() && !current.scenes.length)
  const nextScript = shouldReplace
    ? {
        title: nextScriptBlock.title || current.title || "Untitled production",
        overview: current.overview || "",
        body: extracted,
        scenes: [],
      }
    : {
        ...current,
        title: current.title || nextScriptBlock.title || "Untitled production",
        body: [current.body, extracted].filter(Boolean).join("\n\n"),
        scenes: current.scenes || [],
      }

  const { error: updateError } = await input.context.supabase
    .from("creator_episodes")
    .update({ script_content: nextScript, script_updated_at: new Date().toISOString() })
    .eq("id", input.episodeId)
  if (updateError) throw updateError

  return textMessage(
    input.sessionId,
    shouldReplace
      ? `Done. I replaced the current script with "${nextScript.title}" and saved it to the Script tab.`
      : `Done. I added the script text to "${nextScript.title}" and saved it to the Script tab.`,
    { type: "script_saved", mode: shouldReplace ? "replace" : "append", script: nextScript },
  )
}

function extractScriptText(message: string) {
  return message
    .replace(/^\s*(add|append|put|insert|save|replace|overwrite)\s+(this\s+)?(to|in|into|as)?\s*(the\s+)?(current\s+)?(script|screenplay|scene|sequence)\s*(?:-|:|—)?\s*/i, "")
    .trim()
}

function looksLikeScript(text: string) {
  const trimmed = text.trim()
  if (trimmed.length < 120) return false
  const hasTiming = /\b\d{1,2}:\d{2}\s*(?:-|–|—)\s*\d{1,2}:\d{2}\b/.test(trimmed)
  const hasScriptLabels = /\b(title|episode|duration|characters|script|cliffhanger question)\s*:/i.test(trimmed)
  const hasDialogue = /^[A-Z][A-Za-z .'-]{1,40}\s*:/m.test(trimmed)
  return hasTiming || (hasScriptLabels && hasDialogue)
}

function parseStoredScript(value: unknown) {
  const blank = { title: "Untitled production", overview: "", body: "", scenes: [] as Array<{ heading: string; timing: string; direction: string; framing: string; continuity: string }> }
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...blank, ...(value as typeof blank), scenes: Array.isArray((value as typeof blank).scenes) ? (value as typeof blank).scenes : [] }
  if (typeof value === "string") return { ...blank, body: value }
  return blank
}

function scriptTextToFullScript(text: string) {
  const titleMatch = text.match(/\btitle\s*:\s*([^\n.]+)/i)
  const title = titleMatch?.[1]?.trim() || "New scene"
  return { title }
}

function textMessage(sessionId: string, content: string, result: Record<string, unknown> = { type: "text" }) {
  return { provider: "workflow", result, message: { session_id: sessionId, role: "assistant", content } }
}

function proposalMessage(sessionId: string, content: string, result: unknown) {
  const proposal = typeof result === "object" && result && "proposal" in result ? (result as { proposal?: unknown }).proposal : null
  return {
    provider: "workflow",
    result,
    message: {
      session_id: sessionId,
      role: "assistant",
      content,
      suggested_actions: proposal ? [{ type: "proposal", proposal }] : [],
    },
  }
}
