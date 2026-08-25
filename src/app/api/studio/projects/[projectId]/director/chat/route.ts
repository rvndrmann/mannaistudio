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
import { backgroundRunSecretEnv, dispatchBackgroundRun, shouldRunInBackground } from "@/lib/studio/background-run"
import { computePipelineStage } from "@/lib/studio/pipeline"
import { buildProductionProgress, levelForXp, stagesReached } from "@/lib/studio/production-progress"
import type { DirectorTimelineBlock } from "@/lib/studio/timeline"
import { actionMatchesRequestedShots, parseTargetShotNumbers } from "@/lib/studio/shot-intent"
import { createWorkflowRun } from "@/lib/studio/workflow-runs"
import { nextStepBlock, prepareDirectorTurn } from "@/lib/studio/director-turn"
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

    // Hand an unattended turn to the worker, before any of the turn's own work
    // is done — there is no point building a context here that the worker is
    // about to build for itself.
    //
    // Inert unless the worker's secret is set, so an install that has not
    // deployed one behaves exactly as it did. The header is what stops this
    // recursing: the worker reaches this same route, and its turn must run
    // here rather than being handed onward to another worker.
    const fromWorker = request.headers.get("x-director-background") === "1"
    const backgroundSecret = process.env[backgroundRunSecretEnv]
    if (!fromWorker) {
      const dispatch = shouldRunInBackground({
        mode: readAutopilotSettings(context.project.metadata).mode,
        automated: body.automated,
        secret: backgroundSecret,
      })
      if (dispatch.background && backgroundSecret) {
        const { data: { session } } = await context.supabase.auth.getSession()
        const accessToken = session?.access_token
        if (accessToken) {
          const handedOff = await dispatchBackgroundRun({
            origin: new URL(request.url).origin,
            secret: backgroundSecret,
            job: {
              projectId,
              episodeId: episode.id,
              sessionId,
              message: body.message,
              model,
              mentionedEntityIds: uniqueMentionIds,
              accessToken,
              issuedAt: Date.now(),
            },
          })
          // A worker that could not be reached is not a reason to drop the
          // turn: fall through and run it here, the way it has always run.
          if (handedOff) return NextResponse.json({ background: true, sessionId, reason: dispatch.reason })
        }
      }
    }
    // The turn itself lives in the studio library, not here: it is the same
    // work wherever it runs, and this route is no longer the only place that
    // can run it.
    const prepared = await prepareDirectorTurn({
      context,
      episode,
      sessionId,
      model,
      message: body.message,
      modelMessage,
      mentionedEntities: (mentionedEntities || []) as MentionableEntity[],
      uniqueMentionIds,
      idempotencyKey: body.idempotencyKey,
    })
    const { workflowRun, buildAgentInput, runOnRightAccount, persistAssistantMessage } = prepared


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
