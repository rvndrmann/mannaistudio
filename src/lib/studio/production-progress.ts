import { computePipelineStage, pipelineStageKeys, type PipelineStageKey, type ProductionSnapshot } from "./pipeline"

/**
 * How far a production has got, as something a person can see.
 *
 * The Director already knows the pipeline stage; it just never showed it. A
 * reply that ends "the next step is to create the missing assets" leaves the
 * user to work out where that sits in the whole job and what to type next. A
 * track of stages with the current one marked answers both, and turns a long
 * production into visible progress rather than an open-ended chat.
 */

export type ProgressStageStatus = "done" | "current" | "todo"

export type ProgressStage = {
  key: PipelineStageKey
  title: string
  status: ProgressStageStatus
  xp: number
}

export type ProductionProgress = {
  stages: ProgressStage[]
  currentStage: PipelineStageKey
  completedStages: number
  totalStages: number
  /** Whole percent, so the bar and the caption never disagree by a rounding. */
  percent: number
  /** XP for reaching the current stage, awarded once per episode. */
  stageXp: number
  /** XP for everything reached so far. */
  earnedXp: number
  headline: string
}

/**
 * The stages a user sees, in order. `entity_images` and `keyframes` are folded
 * into the stage they belong to: they are the same piece of work to the person
 * doing it, and eight steps reads as a chore where five reads as a plan.
 */
const TRACK: Array<{ key: PipelineStageKey; title: string; xp: number }> = [
  { key: "script", title: "Script", xp: 20 },
  { key: "prompt_sheet", title: "Prompt sheet", xp: 30 },
  { key: "entities", title: "Characters & assets", xp: 60 },
  { key: "storyboard", title: "Storyboard", xp: 80 },
  { key: "videos", title: "Video", xp: 150 },
  { key: "complete", title: "Finished", xp: 250 },
]

/** Where a raw pipeline stage sits on the track the user is shown. */
const FOLDED: Partial<Record<PipelineStageKey, PipelineStageKey>> = {
  entity_images: "entities",
  keyframes: "storyboard",
}

export function trackStageFor(stage: PipelineStageKey): PipelineStageKey {
  return FOLDED[stage] || stage
}

export function totalXpForTrack(): number {
  return TRACK.reduce((sum, stage) => sum + stage.xp, 0)
}

/**
 * Levels rise on a widening curve, so early productions feel like progress and
 * a hundredth one does not hand out the same level as the first.
 */
export function levelForXp(xp: number): { level: number; into: number; needed: number } {
  const safe = Math.max(0, Math.floor(xp))
  let level = 1
  let remaining = safe
  let step = 500
  while (remaining >= step) {
    remaining -= step
    level += 1
    step = Math.round(step * 1.35)
  }
  return { level, into: remaining, needed: step }
}

export function buildProductionProgress(snapshot: ProductionSnapshot): ProductionProgress {
  const stage = computePipelineStage(snapshot)
  const current = trackStageFor(stage.key)
  const currentIndex = TRACK.findIndex((entry) => entry.key === current)
  const index = currentIndex === -1 ? 0 : currentIndex

  const stages: ProgressStage[] = TRACK.map((entry, position) => ({
    key: entry.key,
    title: entry.title,
    xp: entry.xp,
    status: position < index ? "done" : position === index ? "current" : "todo",
  }))

  // The last stage is only "done" when it is actually reached; everywhere else
  // the current stage is work still in hand.
  const finished = current === "complete"
  if (finished) stages[stages.length - 1].status = "done"

  const completedStages = stages.filter((entry) => entry.status === "done").length
  const earnedXp = stages.filter((entry) => entry.status === "done").reduce((sum, entry) => sum + entry.xp, 0)

  return {
    stages,
    currentStage: current,
    completedStages,
    totalStages: TRACK.length,
    percent: Math.round((completedStages / TRACK.length) * 100),
    stageXp: TRACK[index]?.xp ?? 0,
    earnedXp,
    headline: finished
      ? `${snapshot.episodeName} is finished — all ${snapshot.shots.length} shots rendered.`
      : `${completedStages} of ${TRACK.length} stages done · ${stage.title} in hand`,
  }
}

/**
 * The stages an episode has passed, for awarding XP exactly once each.
 *
 * Reaching stage four means stages one to three happened, whether or not
 * anyone was watching when they did — a user who does the whole job in one run
 * should not be paid for one stage.
 */
export function stagesReached(snapshot: ProductionSnapshot): Array<{ key: PipelineStageKey; xp: number }> {
  const progress = buildProductionProgress(snapshot)
  return progress.stages.filter((stage) => stage.status === "done").map((stage) => ({ key: stage.key, xp: stage.xp }))
}

export { pipelineStageKeys }
