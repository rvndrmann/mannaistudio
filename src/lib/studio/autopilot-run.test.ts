import { describe, expect, it } from "vitest"
import { computePipelineStage, emptySnapshot, type ProductionSnapshot } from "./pipeline"
import {
  decideAutopilot,
  defaultAutopilotBudget,
  type AutopilotAction,
  type AutopilotMode,
  type AutopilotProposal,
} from "./autopilot"

/**
 * A whole production driven end to end by the policy, against the real
 * pipeline.
 *
 * The unit tests each pin one decision. What they cannot show is the property
 * the feature actually rests on: that pressing the pipeline's own next step,
 * over and over, walks a production forward and then *stops* — rather than
 * looping on a stage that never completes, or running past the point its mode
 * was supposed to hand back at. This stands in for the browser loop: same
 * decisions, same order, with the workspace faked just far enough to answer
 * them.
 */

type World = {
  snapshot: ProductionSnapshot
  pending: AutopilotProposal[]
  inFlight: number
  /** Shots whose render is in flight, and what is being rendered. */
  rendering: { number: number; type: "image" | "video" }[]
  /** Every generation the run actually paid to start, in order. */
  started: { number: number; type: "image" | "video" }[]
}

const script: ProductionSnapshot = {
  ...emptySnapshot,
  hasScript: true,
  promptSheetEntityNames: [],
}

/** The Director's side of a turn: the state a stage leaves behind. */
function applyIntent(world: World, stage: string) {
  const snapshot = world.snapshot
  if (stage === "prompt_sheet") {
    world.snapshot = { ...snapshot, promptSheetCount: 3, promptSheetEntityNames: ["Rao", "Neon Street"] }
    return
  }
  if (stage === "entities") {
    world.snapshot = {
      ...snapshot,
      entities: snapshot.promptSheetEntityNames.map((name) => ({ name, type: "character", hasReferenceImage: false })),
    }
    return
  }
  if (stage === "entity_images") {
    // Reference art is a costly tool, so the turn ends on a card rather than
    // on finished art — exactly as the real Character & Asset Agent leaves it.
    world.pending = [{ id: `art-${snapshot.entities.length}`, actionType: "generate_entity_reference_art", title: "Reference art", estimatedCredits: 8 }]
    return
  }
  if (stage === "storyboard") {
    world.snapshot = {
      ...snapshot,
      shots: Array.from({ length: snapshot.promptSheetCount }, (_, index) => ({
        number: index + 1, hasPrompt: true, hasKeyframe: false, hasVideo: false,
      })),
    }
    return
  }
  if (stage === "keyframes" || stage === "videos") {
    const type = stage === "keyframes" ? "image" as const : "video" as const
    const shot = snapshot.shots.find((item) => type === "image" ? !item.hasKeyframe : !item.hasVideo)
    if (!shot) return
    world.pending = [{
      id: `${type}-${shot.number}`,
      actionType: "submit_generation",
      title: `${type === "image" ? "Image" : "Video"} for shot ${shot.number}`,
      estimatedCredits: type === "image" ? 5 : 30,
      generationType: type,
    }]
    return
  }
  throw new Error(`The simulation has no turn for stage "${stage}"`)
}

/** Approving starts the provider job the card described. */
function applyApproval(world: World, ids: string[]) {
  for (const id of ids) {
    const card = world.pending.find((item) => item.id === id)
    if (!card) continue
    if (card.actionType === "generate_entity_reference_art") {
      world.snapshot = { ...world.snapshot, entities: world.snapshot.entities.map((entity) => ({ ...entity, hasReferenceImage: true })) }
    } else {
      const number = Number(id.split("-")[1])
      const type = card.generationType === "video" ? "video" as const : "image" as const
      world.rendering.push({ number, type })
      world.started.push({ number, type })
      world.inFlight += 1
    }
  }
  world.pending = world.pending.filter((item) => !ids.includes(item.id))
}

/** The provider answering: every running job lands. */
function landRenders(world: World) {
  for (const job of world.rendering) {
    world.snapshot = {
      ...world.snapshot,
      shots: world.snapshot.shots.map((shot) => shot.number !== job.number
        ? shot
        : job.type === "image" ? { ...shot, hasKeyframe: true } : { ...shot, hasVideo: true }),
    }
  }
  world.rendering = []
  world.inFlight = 0
}

function actionsFor(world: World): AutopilotAction[] {
  const stage = computePipelineStage(world.snapshot)
  if (!stage.nextAction) return []
  return [stage.nextAction, ...stage.alternatives].map((action) => ({ ...action, stage: stage.key }))
}

type RunResult = {
  snapshot: ProductionSnapshot
  /** Why the run handed back. */
  reason: string
  notice: string | null
  steps: number
  credits: number
  /** Every stage the run pressed, in order. */
  pressed: string[]
  /** Every generation the run paid to start, in order. */
  started: { number: number; type: "image" | "video" }[]
}

function runToCompletion(mode: AutopilotMode, start = script, budget = defaultAutopilotBudget): RunResult {
  const world: World = { snapshot: start, pending: [], inFlight: 0, rendering: [], started: [] }
  const pressed: string[] = []
  let steps = 0
  let credits = 0
  // Twice the step cap: enough that a policy which refused to terminate would
  // be caught here rather than hanging the suite.
  for (let tick = 0; tick < budget.maxSteps * 2 + 20; tick += 1) {
    const decision = decideAutopilot({
      mode,
      actions: actionsFor(world),
      pendingProposals: world.pending,
      inFlight: world.inFlight,
      stepsTaken: steps,
      creditsCommitted: credits,
      budget,
      stopRequested: false,
      busy: false,
      lastError: null,
      creditBalance: 100_000,
      engaged: true,
    })
    if (decision.action === "stop") {
      return { snapshot: world.snapshot, reason: decision.reason, notice: decision.notice, steps, credits, pressed, started: world.started }
    }
    if (decision.action === "wait") {
      // Standing in for the render landing and the workspace reloading.
      landRenders(world)
      continue
    }
    if (decision.action === "approve") {
      credits += world.pending
        .filter((card) => decision.proposalIds.includes(card.id))
        .reduce((total, card) => total + card.estimatedCredits, 0)
      applyApproval(world, decision.proposalIds)
      continue
    }
    const stage = actionsFor(world).find((action) => action.recommended)?.stage || ""
    pressed.push(stage)
    steps += 1
    applyIntent(world, stage)
  }
  throw new Error("The run never handed back — the policy does not terminate")
}

describe("a semi-auto run, from a saved script", () => {
  const result = runToCompletion("semi_auto")

  it("hands back rather than running forever", () => {
    // At the stage, not at the card: it never spends a Director turn asking for
    // a video it is going to refuse to approve. The card path is reached only
    // when the user asked for a clip themselves, and is covered in the unit
    // tests as "video-needs-approval".
    expect(result.reason).toBe("video-stage")
  })

  it("walks the chain in pipeline order, without repeating a stage it finished", () => {
    expect(result.pressed).toEqual(["prompt_sheet", "entities", "entity_images", "storyboard", "keyframes", "keyframes", "keyframes"])
  })

  it("leaves every shot with an image and none rendered", () => {
    expect(result.snapshot.shots.every((shot) => shot.hasKeyframe)).toBe(true)
    expect(result.snapshot.shots.some((shot) => shot.hasVideo)).toBe(false)
  })

  it("points at the mode that would take it from here", () => {
    expect(result.notice).toContain("Full auto")
  })

  it("spends only on the art and the frames it was asked to make", () => {
    expect(result.credits).toBe(8 + 5 * 3)
  })
})

describe("a full-auto run, from a saved script", () => {
  const result = runToCompletion("full_auto")

  it("runs the episode to the end and then stops", () => {
    expect(result.reason).toBe("complete")
    expect(result.snapshot.shots.every((shot) => shot.hasKeyframe && shot.hasVideo)).toBe(true)
  })

  it("renders the clips one at a time rather than in one batch", () => {
    expect(result.pressed.filter((stage) => stage === "videos")).toHaveLength(3)
  })
})

describe("never paying twice for the same shot", () => {
  // The thing that makes an unattended run affordable: a shot that already has
  // its frame is not offered again, and a frame that is mid-render is not
  // ordered a second time while the provider still owes the first.
  const result = runToCompletion("full_auto")

  it("starts exactly one image and one video for every shot", () => {
    for (const shot of result.snapshot.shots) {
      const forShot = result.started.filter((job) => job.number === shot.number)
      expect(forShot.filter((job) => job.type === "image")).toHaveLength(1)
      expect(forShot.filter((job) => job.type === "video")).toHaveLength(1)
    }
  })

  it("finishes every image before it starts the first video", () => {
    const firstVideo = result.started.findIndex((job) => job.type === "video")
    const lastImage = result.started.map((job) => job.type).lastIndexOf("image")
    expect(firstVideo).toBeGreaterThan(lastImage)
  })

  it("renders the videos from shot 1 upward", () => {
    expect(result.started.filter((job) => job.type === "video").map((job) => job.number)).toEqual([1, 2, 3])
  })
})

describe("resuming a production that is already part-finished", () => {
  // Switching an auto mode on halfway through is the normal case, not the edge
  // one. The run has to pick up the work that is missing and leave everything
  // already paid for exactly as it is.
  const halfDone: ProductionSnapshot = {
    ...script,
    promptSheetCount: 4,
    promptSheetEntityNames: ["Rao"],
    entities: [{ name: "Rao", type: "character", hasReferenceImage: true }],
    shots: [
      { number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: true },
      { number: 2, hasPrompt: true, hasKeyframe: true, hasVideo: false },
      { number: 3, hasPrompt: true, hasKeyframe: false, hasVideo: false },
      { number: 4, hasPrompt: true, hasKeyframe: false, hasVideo: false },
    ],
  }
  const result = runToCompletion("full_auto", halfDone)

  it("regenerates nothing that already exists", () => {
    expect(result.started.filter((job) => job.number === 1)).toEqual([])
    expect(result.started.filter((job) => job.number === 2 && job.type === "image")).toEqual([])
  })

  it("makes only the images and videos that were missing", () => {
    expect(result.started).toEqual([
      { number: 3, type: "image" },
      { number: 4, type: "image" },
      { number: 2, type: "video" },
      { number: 3, type: "video" },
      { number: 4, type: "video" },
    ])
  })

  it("finishes the episode", () => {
    expect(result.reason).toBe("complete")
    expect(result.snapshot.shots.every((shot) => shot.hasKeyframe && shot.hasVideo)).toBe(true)
  })
})

describe("a render the provider is still working on", () => {
  it("waits instead of ordering the same frame again", () => {
    const midRender: ProductionSnapshot = {
      ...script,
      promptSheetCount: 2,
      promptSheetEntityNames: ["Rao"],
      entities: [{ name: "Rao", type: "character", hasReferenceImage: true }],
      shots: [
        { number: 1, hasPrompt: true, hasKeyframe: false, hasVideo: false, imageInFlight: true },
        { number: 2, hasPrompt: true, hasKeyframe: true, hasVideo: false, videoInFlight: true },
      ],
    }
    const stage = computePipelineStage(midRender)
    const decision = decideAutopilot({
      mode: "full_auto",
      actions: [stage.nextAction!, ...stage.alternatives].map((action) => ({ ...action, stage: stage.key })),
      pendingProposals: [],
      inFlight: 2,
      stepsTaken: 0,
      creditsCommitted: 0,
      budget: defaultAutopilotBudget,
      stopRequested: false,
      busy: false,
      lastError: null,
      creditBalance: 100_000,
      engaged: true,
    })
    expect(decision).toMatchObject({ action: "wait" })
  })
})

describe("a run that cannot afford to finish", () => {
  // The cap is the whole reason an auto mode is safe to leave alone, so it has
  // to hold against the full chain rather than only against one decision.
  const result = runToCompletion("full_auto", script, { maxSteps: 40, maxCredits: 40, maxBatchShots: 1 })

  it("stops at the cap with the episode part-finished, rather than spending past it", () => {
    expect(result.reason).toBe("credit-cap")
    expect(result.credits).toBeLessThanOrEqual(40)
    expect(result.snapshot.shots.every((shot) => shot.hasVideo)).toBe(false)
  })
})

describe("a run held to a short step cap", () => {
  const result = runToCompletion("full_auto", script, { maxSteps: 3, maxCredits: 10_000, maxBatchShots: 1 })

  it("stops at the cap and says how to carry on", () => {
    expect(result.reason).toBe("step-cap")
    expect(result.steps).toBe(3)
    expect(result.notice).toContain("Start it again")
  })
})

describe("a run started before there is anything to run", () => {
  it("asks for the idea instead of inventing a script", () => {
    const result = runToCompletion("full_auto", emptySnapshot)
    expect(result.reason).toBe("needs-script")
    expect(result.pressed).toEqual([])
  })
})

describe("a run started on a finished episode", () => {
  it("does nothing at all", () => {
    const done: ProductionSnapshot = {
      ...script,
      promptSheetCount: 1,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: true }],
    }
    const result = runToCompletion("full_auto", done)
    expect(result.reason).toBe("complete")
    expect(result.credits).toBe(0)
  })
})
