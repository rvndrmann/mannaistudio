import type { PipelineStageKey } from "./pipeline"
import { parseDirectorTimeline } from "./timeline"

/**
 * Who presses the pipeline's next-step button.
 *
 * The production is a chain of stages, and every Director reply ends on the one
 * step that comes next as a button carrying the intent that runs it. Manual is
 * the user pressing it. The auto modes are the same chain with the pressing
 * done for them, stopping at the point where a human judgement is actually
 * owed rather than at every step.
 *
 * Nothing here executes anything. It reads the state the workspace is already
 * showing and answers one question — press, approve, wait, or hand back — so
 * the rule about what runs unattended lives in one place that can be read and
 * tested, instead of being spread through the chat component as conditions.
 */
export const autopilotModes = ["manual", "semi_auto", "full_auto"] as const
export type AutopilotMode = (typeof autopilotModes)[number]

export const autopilotModeLabels: Record<AutopilotMode, string> = {
  manual: "Manual",
  semi_auto: "Semi-auto",
  full_auto: "Full auto",
}

export const autopilotModeDescriptions: Record<AutopilotMode, string> = {
  manual: "You press every step. Nothing generates until you approve it.",
  semi_auto: "Runs the prompt sheet, characters and assets, their reference art, the storyboard and every shot image on its own, then stops for your approval before any video.",
  full_auto: "Runs everything including the shot videos, one at a time. Stop it whenever you want.",
}

export function isAutopilotMode(value: unknown): value is AutopilotMode {
  return typeof value === "string" && (autopilotModes as readonly string[]).includes(value)
}

/**
 * The stages each mode may run unattended.
 *
 * "script" is in neither on purpose. When no script is saved the pipeline's own
 * next step is to ask the user for the idea in a sentence or two — there is no
 * production to automate yet, and a mode that answered that question for them
 * would be inventing the story. Auto starts at the first stage that is derived
 * from something the user has already written.
 *
 * "complete" is in neither because there is nothing left to press.
 */
const semiAutoStages: PipelineStageKey[] = ["prompt_sheet", "entities", "entity_images", "storyboard", "keyframes"]
const fullAutoStages: PipelineStageKey[] = [...semiAutoStages, "videos"]

export function stagesForMode(mode: AutopilotMode): PipelineStageKey[] {
  if (mode === "full_auto") return fullAutoStages
  if (mode === "semi_auto") return semiAutoStages
  return []
}

/** The next-step button as the chat already holds it. */
export type AutopilotAction = {
  id: string
  label: string
  intent: string
  risk: "read" | "write" | "costly" | "destructive"
  recommended: boolean
  /** The pipeline stage this action belongs to, carried on the action payload. */
  stage?: string
}

/** A prepared change waiting on the user, as the workspace lists it. */
export type AutopilotProposal = {
  id: string
  actionType: string
  title: string
  estimatedCredits: number
  /** "image", "video", or absent for a proposal that generates nothing. */
  generationType?: string
}

/**
 * The next-step actions on the newest reply, read from the same timeline block
 * the chat renders as buttons. The stage each one belongs to travels on its
 * payload, which is what the mode's policy is written against — so the loop
 * presses precisely what the user would have pressed, never a step of its own.
 */
export function autopilotActionsFrom(timelineBlocks: unknown): AutopilotAction[] {
  const block = parseDirectorTimeline(timelineBlocks).filter((item) => item.type === "suggested_actions").at(-1);
  if (!block || block.type !== "suggested_actions") return [];
  return block.actions.map((action) => ({
    id: action.id,
    label: action.label,
    intent: action.intent,
    risk: action.risk,
    recommended: action.recommended,
    stage: typeof (action.payload as { stage?: unknown } | undefined)?.stage === "string"
      ? String((action.payload as { stage?: unknown }).stage)
      : undefined,
  }));
}

/**
 * The stored step, but only while it still describes the current state.
 *
 * A reply's next-step block is a snapshot of the production at the moment that
 * reply was written. Approving the card it led to, and letting the render land,
 * moves the production on without any new reply being written — so the block
 * goes on offering a frame that now exists. Replaying it pays for that frame a
 * second time.
 *
 * Once a block has been acted on it is spent, and an empty list is what makes
 * the run ask the Director for the next step against live state instead.
 */
export function usableAutopilotActions(
  actions: AutopilotAction[],
  replyId: string | null | undefined,
  consumedReplyId: string | null | undefined,
): AutopilotAction[] {
  if (!replyId || replyId === consumedReplyId) return []
  return actions
}

export type AutopilotBudget = {
  /** Turns the loop may take before handing back, so a misread never runs away. */
  maxSteps: number
  /** Credits the run may commit before handing back. */
  maxCredits: number
  /**
   * Most shot images one batch may cover.
   *
   * Every generation is charged, so a batch commits the credits for every shot
   * in it the moment it is approved — and a queued job cannot be recalled by
   * pressing Stop. The bound is what keeps one approval from being an open
   * cheque on a long episode; the run's credit cap still applies on top.
   */
  maxBatchShots: number
}

export const defaultAutopilotBudget: AutopilotBudget = { maxSteps: 40, maxCredits: 500, maxBatchShots: 20 }

/**
 * What to send when there is no next-step button to press.
 *
 * The loop reads its step from the newest reply's stored block, so a session
 * whose last reply carries none — a fresh chat, a turn that only answered a
 * question, a reply from before the block existed — left an auto run with
 * nothing to do and no way to say so. It sat silent while the production was
 * plainly unfinished, which reads as the mode being broken.
 *
 * It does not need the block to know where the production stands: every turn is
 * given the pipeline state server-side. So the run asks, and the Director picks
 * up from whatever stage the workspace is actually at.
 */
export const autopilotResumeIntent =
  "Pick up this production where it left off. Read the current stage, say in one line what is already done and what is outstanding, then carry out the single next step yourself. Do not re-create anything that already exists and do not regenerate any image or video that is already there."

export type AutopilotInput = {
  mode: AutopilotMode
  /** The next-step actions on the newest assistant reply. */
  actions: AutopilotAction[]
  /** Prepared changes still pending in this session. */
  pendingProposals: AutopilotProposal[]
  /** Generations queued or rendering right now. */
  inFlight: number
  /** Turns this run has already taken. */
  stepsTaken: number
  /** Credits this run has already committed. */
  creditsCommitted: number
  budget: AutopilotBudget
  /** The user pressed Stop. */
  stopRequested: boolean
  /** A turn is streaming, or the workspace is mid-reload. */
  busy: boolean
  /** The last turn failed. */
  lastError?: string | null
  /** The credit account balance, when the workspace knows it. */
  creditBalance?: number | null
  /**
   * Shot numbers that have a prompt, have no image, and have nothing rendering
   * — in storyboard order.
   *
   * Read from the workspace rather than from the step's wording, because the
   * step only ever names one shot. Anything already generated is excluded at
   * the source: a shot that appears here twice, or that already has its frame,
   * is a shot charged for twice.
   */
  shotsAwaitingImage?: number[]
  /**
   * The user has done something in this session — chosen the mode, sent a
   * message, pressed a step.
   *
   * The mode is remembered on the project, so without this a page opened days
   * later with Full auto still stored would start rendering the moment it
   * finished loading, with nobody having asked for it. Remembering the setting
   * and resuming the spending are different things: the switch keeps its
   * position, and the run waits to be started.
   */
  engaged: boolean
}

export type AutopilotDecision =
  /** Send this intent to the Director, exactly as pressing the button would. */
  | { action: "run"; intent: string; label: string; reason: string }
  /** Approve these prepared changes so the work they describe can start. */
  | { action: "approve"; proposalIds: string[]; reason: string }
  /** Something is already running. Do nothing and look again when it lands. */
  | { action: "wait"; reason: string }
  /** Hand back to the user. `notice` is null when there is nothing to say. */
  | { action: "stop"; reason: string; notice: string | null }

/**
 * Tools that only ever add something that does not exist yet.
 *
 * This is the line the allowlist is drawn on, and it is worth stating plainly:
 * a mode may approve work that *builds*, never work that *changes or removes*.
 * Creating the characters the sheet names, building the storyboard, making
 * reference art — none of these can take away something the user already has,
 * so an unattended run doing them is recoverable. Rewriting a script, editing a
 * shot's prompt, deleting a shot: those change work the user may have written
 * themselves, and no mode approves them however routine they look.
 */
const additiveTools = new Set([
  "create_production_entity",
  "create_production_entities_batch",
  "create_storyboard_batch",
  "write_episode_master_prompt",
  "generate_entity_reference_art",
  // Marks existing art as still matching its description. It generates nothing
  // and spends nothing — it is the cheap way out of the stale-art stage.
  "accept_existing_art",
])

/**
 * Tools whose scope depends on whether a clip is involved.
 *
 * Generating a shot's media and attaching that media to the shot are two halves
 * of one step: the frame is made, then it is written onto the shot it was made
 * for. Approving the first and stopping at the second leaves the run holding an
 * image it cannot put anywhere, which is exactly where a real run stalled —
 * every image made, and a card called "Update shot 6" blocking the rest.
 *
 * Both are gated the same way, because both are how a video reaches the
 * storyboard, and video is the half semi-auto exists to stop before.
 */
const mediaTools = new Set(["submit_generation", "attach_media_to_shot"])

/**
 * Whether a prepared change is one this mode may approve without being asked.
 *
 * Deliberately an allowlist. Every costly tool creates an approval card, but so
 * does every destructive and most structural ones, and a mode that approved
 * whatever card appeared would delete a shot because the model decided to tidy
 * up. Anything not named here stops the run and is handed to the user, which is
 * the behaviour that makes the modes safe to leave alone.
 */
export function proposalIsAutoApprovable(proposal: AutopilotProposal, mode: AutopilotMode): boolean {
  if (mode === "manual") return false
  if (additiveTools.has(proposal.actionType)) return true
  if (!mediaTools.has(proposal.actionType)) return false
  // A clip is the expensive half of the pipeline and the half semi-auto exists
  // to stop before. The type is read from the card's own payload, so a card
  // that does not say is treated as an image — the cheaper reading.
  if (proposal.generationType === "video") return mode === "full_auto"
  return true
}

function creditsFor(proposals: AutopilotProposal[]): number {
  return proposals.reduce((total, proposal) => total + (Number.isFinite(proposal.estimatedCredits) ? proposal.estimatedCredits : 0), 0)
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm
}

/**
 * The batch of shot images to ask for in one request.
 *
 * The pipeline offers one shot at a time, which is right for a person deciding
 * shot by shot but makes an unattended run pay a full Director turn per frame.
 * The provider is not the reason to go one at a time — the server renders a
 * batch's jobs serially anyway — so batching costs the same credits for the
 * same pictures and simply removes the turns between them.
 *
 * Bounded by the batch limit rather than sent whole, because approving a batch
 * commits every shot's credits at once and a queued job cannot be called back.
 */
export function autopilotImageBatch(input: AutopilotInput): number[] {
  const awaiting = input.shotsAwaitingImage || []
  // De-duplicated for the same reason it is bounded: a number appearing twice
  // is a frame charged for twice.
  return Array.from(new Set(awaiting)).slice(0, Math.max(1, input.budget.maxBatchShots))
}

function batchImageIntent(numbers: number[]): string {
  return [
    `Generate the storyboard keyframe images for shot ${numbers.join(", ")} in one batch.`,
    "Submit them as a single generation request covering exactly those shots, each from its own saved prompt and the reference art that shot already links to.",
    "Do not submit them one at a time, do not widen the request to any other shot, and do not include a shot that already has an image — every generation is charged, so a shot included twice is paid for twice.",
  ].join(" ")
}

/**
 * The one move autopilot makes from here.
 *
 * The order of the checks is the safety property. Stop conditions are asked
 * before work, prepared changes before new steps, and running jobs before
 * anything that would start another — so a run can neither pay twice for the
 * same frame nor step past a card the user is owed.
 */
export function decideAutopilot(input: AutopilotInput): AutopilotDecision {
  if (input.mode === "manual") return { action: "stop", reason: "manual", notice: null }
  if (!input.engaged) return { action: "stop", reason: "not-started", notice: null }
  if (input.stopRequested) return { action: "stop", reason: "stopped", notice: "Stopped. Nothing else will run until you start it again." }
  // A turn in flight owns the conversation. Deciding now would read the state
  // as it was before the turn, and press a step it is already taking.
  if (input.busy) return { action: "wait", reason: "busy" }
  if (input.lastError) {
    return { action: "stop", reason: "error", notice: `Stopped after an error: ${input.lastError} Nothing else will run until you start it again.` }
  }
  if (input.stepsTaken >= input.budget.maxSteps) {
    return { action: "stop", reason: "step-cap", notice: `Stopped after ${input.budget.maxSteps} automatic steps. Start it again to keep going.` }
  }
  if (input.creditsCommitted >= input.budget.maxCredits) {
    return { action: "stop", reason: "credit-cap", notice: `Stopped at the ${input.budget.maxCredits}-credit cap for this run. Start it again to keep going.` }
  }

  const pending = input.pendingProposals
  if (pending.length) {
    const blocked = pending.filter((proposal) => !proposalIsAutoApprovable(proposal, input.mode))
    if (blocked.length) {
      // Naming the card matters more than counting them: the user is being
      // asked to look at something specific, and "1 change is waiting" tells
      // them nothing about whether it is a render or a deletion.
      const isVideo = blocked.every((proposal) => proposal.generationType === "video")
      return {
        action: "stop",
        reason: isVideo ? "video-needs-approval" : "proposal-needs-approval",
        notice: isVideo
          ? `Every shot image is done. ${blocked.length} ${plural(blocked.length, "video")} ${plural(blocked.length, "is", "are")} ready to render and ${plural(blocked.length, "is", "are")} waiting for you — approve ${plural(blocked.length, "it", "them")}, or switch to Full auto to render the rest on its own.`
          : `Waiting on you: ${blocked.map((proposal) => proposal.title).join("; ")}.`,
      }
    }
    const cost = creditsFor(pending)
    if (input.creditsCommitted + cost > input.budget.maxCredits) {
      return {
        action: "stop",
        reason: "credit-cap",
        notice: `The next step costs about ${cost} ${plural(cost, "credit")}, which would pass this run's ${input.budget.maxCredits}-credit cap. Approve it yourself, or raise the cap.`,
      }
    }
    if (typeof input.creditBalance === "number" && cost > input.creditBalance) {
      return {
        action: "stop",
        reason: "insufficient-credits",
        notice: `The next step costs about ${cost} ${plural(cost, "credit")} and the balance is ${input.creditBalance}. Top up to keep going.`,
      }
    }
    return {
      action: "approve",
      proposalIds: pending.map((proposal) => proposal.id),
      reason: "approve-prepared-work",
    }
  }

  // A provider job is not a finished frame. Starting the next step while one is
  // rendering is how the same shot gets paid for twice.
  if (input.inFlight > 0) return { action: "wait", reason: "generating" }

  const allowed = stagesForMode(input.mode)
  // The recommended action is the pipeline's own next step; the rest are the
  // moves offered beside it, which are alternatives a person chooses between,
  // not steps to take automatically.
  const action = input.actions.find((item) => item.recommended) || input.actions[0]
  if (!action) {
    // Nothing to read, but the production is not necessarily finished. Ask
    // rather than stall — the repeat guard stops this if the reply keeps
    // coming back without a step.
    return { action: "run", intent: autopilotResumeIntent, label: "Pick up where the production left off", reason: "resume" }
  }

  const stage = action.stage as PipelineStageKey | undefined
  if (stage === "complete") {
    return { action: "stop", reason: "complete", notice: "Every shot has an image and a rendered clip. The episode is ready for review." }
  }
  if (stage === "script") {
    return { action: "stop", reason: "needs-script", notice: "This episode has no script yet. Tell the Director the idea in a sentence or two and it will take over from there." }
  }
  if (!stage || !allowed.includes(stage)) {
    if (stage === "videos") {
      return { action: "stop", reason: "video-stage", notice: "Every shot image is done. Switch to Full auto to render the videos on their own, or press the step yourself." }
    }
    return { action: "stop", reason: "stage-not-automatic", notice: `The next step is one to decide yourself: ${action.label}.` }
  }
  // A read-only step is the pipeline saying "there is nothing to start yet":
  // check on a render, review a pending card. Anything actually running was
  // caught by the in-flight check above, and a real pending card by the check
  // before that — so reaching here means the stored step is describing a state
  // the production has already moved past.
  //
  // This used to wait. With nothing left to wait for, that was a run which
  // stopped dead on a stale "Review 1 pending change" button while ten shots
  // still had no image, and polled forever without ever asking why.
  if (action.risk === "read") {
    return { action: "run", intent: autopilotResumeIntent, label: "Pick up where the production left off", reason: "stale-read-step" }
  }
  if (action.risk === "destructive") {
    return { action: "stop", reason: "destructive-step", notice: `The next step removes something, so it is yours to press: ${action.label}.` }
  }

  // Images batch; clips do not. A clip is many times the price of a frame, and
  // serial video is what lets Stop actually save the user money — after each
  // one, the run can be halted before the next is committed.
  if (stage === "keyframes") {
    const batch = autopilotImageBatch(input)
    if (batch.length > 1) {
      return {
        action: "run",
        intent: batchImageIntent(batch),
        label: `Generate ${batch.length} shot images`,
        reason: `stage:keyframes:batch:${batch.length}`,
      }
    }
  }

  return { action: "run", intent: action.intent, label: action.label, reason: `stage:${stage}` }
}

/**
 * The mode as the project stores it.
 *
 * `ai_director_full_auto` already existed on project metadata, written by the
 * update_full_auto_mode tool and read by nothing — an on/off flag with a credit
 * cap and no runner behind it. The same key now holds the three-way mode, so a
 * project that had the flag set keeps its caps and reads as full auto rather
 * than being silently reset to manual.
 */
export type StoredAutopilotSettings = {
  mode: AutopilotMode
  budget: AutopilotBudget
}

export function readAutopilotSettings(metadata: unknown): StoredAutopilotSettings {
  const stored = (metadata as { ai_director_full_auto?: Record<string, unknown> } | null)?.ai_director_full_auto
  if (!stored || typeof stored !== "object") return { mode: "manual", budget: defaultAutopilotBudget }
  const mode = isAutopilotMode(stored.mode) ? stored.mode : stored.enabled === true ? "full_auto" : "manual"
  const maxCredits = typeof stored.credit_cap === "number" && stored.credit_cap > 0 ? Math.floor(stored.credit_cap) : defaultAutopilotBudget.maxCredits
  const maxSteps = typeof stored.max_steps === "number" && stored.max_steps > 0 ? Math.floor(stored.max_steps) : defaultAutopilotBudget.maxSteps
  // The old stub called this max_jobs_per_run, which is the same idea: how many
  // generations one approval may commit. Reused so a project that set it keeps it.
  const maxBatchShots = typeof stored.max_jobs_per_run === "number" && stored.max_jobs_per_run > 0
    ? Math.floor(stored.max_jobs_per_run)
    : defaultAutopilotBudget.maxBatchShots
  return { mode, budget: { maxSteps, maxCredits, maxBatchShots } }
}

export function writeAutopilotSettings(metadata: unknown, settings: StoredAutopilotSettings): Record<string, unknown> {
  const current = (metadata as Record<string, unknown> | null) || {}
  const stored = (current.ai_director_full_auto as Record<string, unknown> | undefined) || {}
  return {
    ...current,
    ai_director_full_auto: {
      ...stored,
      mode: settings.mode,
      // Kept in step with the mode so the older flag never disagrees with it.
      enabled: settings.mode === "full_auto",
      credit_cap: settings.budget.maxCredits,
      max_steps: settings.budget.maxSteps,
      max_jobs_per_run: settings.budget.maxBatchShots,
      updated_at: new Date().toISOString(),
    },
  }
}

/**
 * The run mode as the Director reads it.
 *
 * Without it every reply closes the way a manual one does — "press the step
 * below" — while a loop is already pressing it, so the transcript of an
 * unattended run reads as a series of instructions nobody was there to follow.
 * It also stops the Director stalling on a question it could answer itself: in
 * an auto run there is no one at the keyboard to pick between two options.
 */
export function autopilotInstructionBlock(mode: AutopilotMode): string {
  if (mode === "manual") return ""
  const stopsAt = mode === "semi_auto"
    ? "Videos are not part of this run. When every shot has its image, say so and stop — the user approves the clips themselves."
    : "This run continues through the shot videos, one at a time, to the end of the episode."
  return [
    "=== RUN MODE ===",
    `The user has this production in ${autopilotModeLabels[mode]}. The workspace presses the next step for them and approves the generations it covers, so no one is reading your reply as it lands.`,
    "Close each reply by saying what you finished and what runs next as a statement, not as an instruction to press or click anything.",
    "Do not stop to ask which of two reasonable options to take, and do not ask for confirmation before work this mode already covers: choose the option that fits the saved script, brief and style, say in one line which you chose and why, and carry on.",
    "Still stop and ask when the answer is genuinely the user's — something the saved material does not contain, or work that removes or rewrites what they already approved.",
    stopsAt,
    "================",
  ].join("\n")
}
