import { describe, expect, it } from "vitest"
import { computePipelineStage, emptySnapshot, type ProductionSnapshot } from "./pipeline"
import {
  autopilotActionsFrom,
  autopilotImageBatch,
  autopilotInstructionBlock,
  autopilotResumeIntent,
  decideAutopilot,
  defaultAutopilotBudget,
  proposalIsAutoApprovable,
  readAutopilotSettings,
  writeAutopilotSettings,
  stagesForMode,
  usableAutopilotActions,
  type AutopilotAction,
  type AutopilotInput,
  type AutopilotMode,
  type AutopilotProposal,
} from "./autopilot"

const idle: Omit<AutopilotInput, "mode"> = {
  actions: [],
  pendingProposals: [],
  inFlight: 0,
  stepsTaken: 0,
  creditsCommitted: 0,
  budget: defaultAutopilotBudget,
  stopRequested: false,
  busy: false,
  lastError: null,
  creditBalance: 10_000,
  engaged: true,
}

function action(stage: string, overrides: Partial<AutopilotAction> = {}): AutopilotAction {
  return {
    id: `pipeline-${stage}`,
    label: `Do the ${stage} step`,
    intent: `Do the ${stage} step.`,
    risk: "costly",
    recommended: true,
    stage,
    ...overrides,
  }
}

function proposal(overrides: Partial<AutopilotProposal> = {}): AutopilotProposal {
  return { id: "p1", actionType: "submit_generation", title: "Generate the image for shot 1", estimatedCredits: 10, ...overrides }
}

function decide(mode: AutopilotMode, overrides: Partial<AutopilotInput> = {}) {
  return decideAutopilot({ ...idle, mode, ...overrides })
}

describe("stagesForMode", () => {
  it("never automates the script, because there is no production to automate yet", () => {
    expect(stagesForMode("semi_auto")).not.toContain("script")
    expect(stagesForMode("full_auto")).not.toContain("script")
  })

  it("separates the two auto modes only by whether video renders on its own", () => {
    expect(stagesForMode("semi_auto")).not.toContain("videos")
    expect(stagesForMode("full_auto")).toContain("videos")
    expect(stagesForMode("full_auto")).toEqual([...stagesForMode("semi_auto"), "videos"])
  })

  it("automates nothing in manual", () => {
    expect(stagesForMode("manual")).toEqual([])
  })
})

describe("decideAutopilot in manual mode", () => {
  it("does nothing, and says nothing, whatever the state", () => {
    expect(decide("manual", { actions: [action("keyframes")] })).toEqual({ action: "stop", reason: "manual", notice: null })
  })
})

describe("decideAutopilot stop conditions", () => {
  it("stops the moment the user asks it to", () => {
    const decision = decide("full_auto", { stopRequested: true, actions: [action("keyframes")] })
    expect(decision.action).toBe("stop")
    expect(decision).toMatchObject({ reason: "stopped" })
  })

  it("stops on an error rather than retrying the step that failed", () => {
    const decision = decide("full_auto", { lastError: "The provider rejected the prompt.", actions: [action("keyframes")] })
    expect(decision).toMatchObject({ action: "stop", reason: "error" })
    expect(decision.action === "stop" && decision.notice).toContain("The provider rejected the prompt.")
  })

  it("stops at the step cap so a misread state cannot run away", () => {
    const decision = decide("full_auto", { stepsTaken: 40, actions: [action("keyframes")] })
    expect(decision).toMatchObject({ action: "stop", reason: "step-cap" })
  })

  it("stops at the credit cap before approving anything further", () => {
    const decision = decide("full_auto", { creditsCommitted: 500, pendingProposals: [proposal()] })
    expect(decision).toMatchObject({ action: "stop", reason: "credit-cap" })
  })

  it("stops when the next approval would take the run past its cap", () => {
    const decision = decide("full_auto", { creditsCommitted: 480, pendingProposals: [proposal({ estimatedCredits: 40 })] })
    expect(decision).toMatchObject({ action: "stop", reason: "credit-cap" })
    expect(decision.action === "stop" && decision.notice).toContain("40 credits")
  })

  it("stops when the account cannot pay for the step, rather than approving a card that will fail", () => {
    const decision = decide("full_auto", { creditBalance: 5, pendingProposals: [proposal({ estimatedCredits: 40 })] })
    expect(decision).toMatchObject({ action: "stop", reason: "insufficient-credits" })
  })

  it("hands back with the idea request when the episode has no script", () => {
    const decision = decide("full_auto", { actions: [action("script", { risk: "write" })] })
    expect(decision).toMatchObject({ action: "stop", reason: "needs-script" })
  })

  it("hands back when the production is finished", () => {
    const decision = decide("full_auto", { actions: [action("complete", { risk: "read" })] })
    expect(decision).toMatchObject({ action: "stop", reason: "complete" })
  })

  it("will not press a step that removes something", () => {
    const decision = decide("full_auto", { actions: [action("keyframes", { risk: "destructive", label: "Delete shot 4" })] })
    expect(decision).toMatchObject({ action: "stop", reason: "destructive-step" })
    expect(decision.action === "stop" && decision.notice).toContain("Delete shot 4")
  })
})

describe("decideAutopilot waiting", () => {
  it("waits rather than deciding from state a running turn has not finished changing", () => {
    expect(decide("full_auto", { busy: true, actions: [action("keyframes")] })).toMatchObject({ action: "wait", reason: "busy" })
  })

  it("waits while a generation is in flight, so no shot is paid for twice", () => {
    const decision = decide("full_auto", { inFlight: 1, actions: [action("keyframes")] })
    expect(decision).toMatchObject({ action: "wait", reason: "generating" })
  })

  it("waits on a read-only step only while something is actually rendering", () => {
    // "Check on shot 3" moves nothing, so with a render in flight the run sits
    // still rather than pressing it in a loop.
    const decision = decide("full_auto", { inFlight: 1, actions: [action("keyframes", { risk: "read", label: "Check on shot 3" })] })
    expect(decision).toMatchObject({ action: "wait", reason: "generating" })
  })

  it("asks where things stand when a read-only step is all that is left and nothing is running", () => {
    // The real failure this came from: a stale "Review 1 pending change" button
    // on an old reply, no card actually pending, no render in flight, and ten
    // shots still without an image. Waiting there was waiting for nothing.
    const decision = decide("full_auto", { actions: [action("keyframes", { risk: "read", label: "Review 1 pending change" })] })
    expect(decision).toMatchObject({ action: "run", reason: "stale-read-step", intent: autopilotResumeIntent })
  })

  it("still finishes on a complete production rather than asking again", () => {
    expect(decide("full_auto", { actions: [action("complete", { risk: "read" })] })).toMatchObject({ action: "stop", reason: "complete" })
  })

  it("still answers a real pending card rather than asking around it", () => {
    const decision = decide("semi_auto", {
      actions: [action("entities", { risk: "read", label: "Review 1 pending change" })],
      pendingProposals: [proposal()],
    })
    expect(decision.action).toBe("approve")
  })

  it("answers a prepared change before it answers a running job", () => {
    // Both are true at once whenever a batch is half started. Approving first
    // is what keeps the rest of the batch from being stranded behind the card.
    const decision = decide("full_auto", { inFlight: 1, pendingProposals: [proposal()] })
    expect(decision.action).toBe("approve")
  })
})

describe("decideAutopilot approvals", () => {
  it("approves an image generation in semi-auto", () => {
    const decision = decide("semi_auto", { pendingProposals: [proposal({ generationType: "image" })] })
    expect(decision).toMatchObject({ action: "approve", proposalIds: ["p1"] })
  })

  it("approves reference art in semi-auto", () => {
    const decision = decide("semi_auto", { pendingProposals: [proposal({ actionType: "generate_entity_reference_art" })] })
    expect(decision.action).toBe("approve")
  })

  it("stops semi-auto at the first video and says how to go on", () => {
    const decision = decide("semi_auto", { pendingProposals: [proposal({ generationType: "video", title: "Render shot 1" })] })
    expect(decision).toMatchObject({ action: "stop", reason: "video-needs-approval" })
    expect(decision.action === "stop" && decision.notice).toContain("Full auto")
  })

  it("approves the video in full auto", () => {
    const decision = decide("full_auto", { pendingProposals: [proposal({ generationType: "video" })] })
    expect(decision.action).toBe("approve")
  })

  it("attaches the image it just made, rather than stranding it", () => {
    // The real stall: every image generated, then a card called "Update shot 6"
    // — the attach — blocking the whole run because the allowlist only knew
    // about generation.
    const decision = decide("semi_auto", {
      pendingProposals: [proposal({ actionType: "attach_media_to_shot", generationType: "image", title: "Update shot 6" })],
    })
    expect(decision.action).toBe("approve")
  })

  it("holds a video attach back in semi-auto, the same as the render itself", () => {
    expect(proposalIsAutoApprovable({ id: "a", actionType: "attach_media_to_shot", title: "Update shot 6", estimatedCredits: 0, generationType: "video" }, "semi_auto")).toBe(false)
    expect(proposalIsAutoApprovable({ id: "a", actionType: "attach_media_to_shot", title: "Update shot 6", estimatedCredits: 0, generationType: "video" }, "full_auto")).toBe(true)
  })

  it.each([
    "create_production_entity",
    "create_production_entities_batch",
    "create_storyboard_batch",
    "write_episode_master_prompt",
    "accept_existing_art",
  ])("approves %s, because the stages the modes claim to run need it", (actionType) => {
    // Semi-auto says it runs the characters, their art and the storyboard. Each
    // of those stages is built by a tool that raises an approval card, so an
    // allowlist that missed them promised work it would then refuse to do.
    expect(decide("semi_auto", { pendingProposals: [proposal({ actionType })] }).action).toBe("approve")
  })

  it.each([
    "update_script",
    "update_shot",
    "update_asset",
    "delete_shot",
    "delete_asset",
    "fix_shot_aspect_mismatch",
    "update_full_auto_mode",
  ])("never approves %s, because it changes or removes existing work", (actionType) => {
    for (const mode of ["semi_auto", "full_auto"] as const) {
      expect(proposalIsAutoApprovable({ id: "a", actionType, title: actionType, estimatedCredits: 0 }, mode)).toBe(false)
    }
  })

  it("never approves a deletion, in either auto mode", () => {
    for (const mode of ["semi_auto", "full_auto"] as const) {
      const decision = decide(mode, { pendingProposals: [proposal({ actionType: "delete_shot", title: "Delete shot 4" })] })
      expect(decision).toMatchObject({ action: "stop", reason: "proposal-needs-approval" })
      expect(decision.action === "stop" && decision.notice).toContain("Delete shot 4")
    }
  })

  it("hands back the whole batch when any one card in it needs a person", () => {
    const decision = decide("full_auto", {
      pendingProposals: [proposal({ id: "a" }), proposal({ id: "b", actionType: "update_script", title: "Rewrite scene 2" })],
    })
    expect(decision.action).toBe("stop")
  })

  it("treats a card that does not name its type as an image, the cheaper reading", () => {
    expect(proposalIsAutoApprovable(proposal({ generationType: undefined }), "semi_auto")).toBe(true)
  })
})

describe("decideAutopilot running the chain", () => {
  it.each(["prompt_sheet", "entities", "entity_images", "storyboard", "keyframes"] as const)(
    "presses the %s step in semi-auto",
    (stage) => {
      const decision = decide("semi_auto", { actions: [action(stage)] })
      expect(decision).toMatchObject({ action: "run", intent: `Do the ${stage} step.` })
    },
  )

  it("stops semi-auto once the chain reaches video", () => {
    const decision = decide("semi_auto", { actions: [action("videos")] })
    expect(decision).toMatchObject({ action: "stop", reason: "video-stage" })
  })

  it("presses the video step in full auto", () => {
    expect(decide("full_auto", { actions: [action("videos")] }).action).toBe("run")
  })

  it("takes the recommended step, not an alternative offered beside it", () => {
    const decision = decide("full_auto", {
      actions: [
        action("keyframes", { id: "redo", label: "Regenerate shot 1", intent: "Redo shot 1.", recommended: false }),
        action("keyframes", { id: "next", label: "Generate shot 2", intent: "Do shot 2.", recommended: true }),
      ],
    })
    expect(decision).toMatchObject({ action: "run", intent: "Do shot 2." })
  })

  it("hands back an action whose stage it cannot read, rather than guessing", () => {
    const decision = decide("full_auto", { actions: [action("keyframes", { stage: undefined })] })
    expect(decision).toMatchObject({ action: "stop", reason: "stage-not-automatic" })
  })

  it("asks where the production stands when the reply carried no step at all", () => {
    // The alternative was silence: no step to read, so no work and no notice,
    // while the production sat plainly unfinished.
    expect(decide("full_auto")).toMatchObject({ action: "run", reason: "resume", intent: autopilotResumeIntent })
  })

  it("tells the resuming turn not to redo work that already exists", () => {
    expect(autopilotResumeIntent).toContain("do not regenerate any image or video that is already there")
  })

  it("still answers a pending card before asking to resume", () => {
    expect(decide("semi_auto", { pendingProposals: [proposal()] }).action).toBe("approve")
  })

  it("still waits on a running render before asking to resume", () => {
    expect(decide("full_auto", { inFlight: 1 })).toMatchObject({ action: "wait", reason: "generating" })
  })

  it("never resumes in manual", () => {
    expect(decide("manual")).toEqual({ action: "stop", reason: "manual", notice: null })
  })
})

describe("decideAutopilot against the real pipeline", () => {
  // The stage keys the modes are written against are the pipeline's own, so a
  // renamed stage must fail here rather than silently stop automating.
  function stageAction(snapshot: ProductionSnapshot): AutopilotAction[] {
    const stage = computePipelineStage(snapshot)
    if (!stage.nextAction) return []
    return [{ ...stage.nextAction, stage: stage.key }]
  }

  const withScript: ProductionSnapshot = { ...emptySnapshot, hasScript: true }

  it("runs the prompt sheet the pipeline asks for once a script exists", () => {
    expect(decide("semi_auto", { actions: stageAction(withScript) }).action).toBe("run")
  })

  it("stops on the pipeline's own script stage", () => {
    expect(decide("full_auto", { actions: stageAction(emptySnapshot) })).toMatchObject({ action: "stop", reason: "needs-script" })
  })

  it("answers the card when the pipeline's pending-approval stage has a real one behind it", () => {
    const decision = decide("full_auto", {
      actions: stageAction({ ...withScript, pendingApprovals: 1 }),
      pendingProposals: [proposal()],
    })
    expect(decision.action).toBe("approve")
  })

  it("re-reads the state when that stage names a card the workspace does not have", () => {
    // The two disagree whenever a card is answered without a new reply being
    // written: the stored step still says "Review 1 pending change" and there
    // is nothing to review. Believing the step is what stalled a real run.
    const decision = decide("full_auto", { actions: stageAction({ ...withScript, pendingApprovals: 2 }), pendingProposals: [] })
    expect(decision).toMatchObject({ action: "run", reason: "stale-read-step" })
  })

  it("runs reference art, then the storyboard, then stops semi-auto before the clip", () => {
    const needsArt: ProductionSnapshot = {
      ...withScript,
      promptSheetCount: 2,
      promptSheetEntityNames: ["Rao"],
      entities: [{ name: "Rao", type: "character", hasReferenceImage: false }],
    }
    expect(decide("semi_auto", { actions: stageAction(needsArt) }).action).toBe("run")

    const needsBoard: ProductionSnapshot = { ...needsArt, entities: [{ name: "Rao", type: "character", hasReferenceImage: true }] }
    expect(decide("semi_auto", { actions: stageAction(needsBoard) }).action).toBe("run")

    const allFramed: ProductionSnapshot = {
      ...needsBoard,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false }],
    }
    expect(decide("semi_auto", { actions: stageAction(allFramed) })).toMatchObject({ action: "stop", reason: "video-stage" })
    expect(decide("full_auto", { actions: stageAction(allFramed) }).action).toBe("run")
  })

  it("stops both modes on the finished episode", () => {
    const done: ProductionSnapshot = {
      ...withScript,
      promptSheetCount: 1,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: true }],
    }
    expect(decide("full_auto", { actions: stageAction(done) })).toMatchObject({ action: "stop", reason: "complete" })
  })
})

describe("stored settings", () => {
  it("reads manual from a project that has never set a mode", () => {
    expect(readAutopilotSettings(null)).toEqual({ mode: "manual", budget: defaultAutopilotBudget })
    expect(readAutopilotSettings({}).mode).toBe("manual")
  })

  it("reads the old on/off flag as full auto, rather than resetting it to manual", () => {
    expect(readAutopilotSettings({ ai_director_full_auto: { enabled: true, credit_cap: 250 } }))
      .toEqual({ mode: "full_auto", budget: { maxSteps: defaultAutopilotBudget.maxSteps, maxCredits: 250, maxBatchShots: defaultAutopilotBudget.maxBatchShots } })
  })

  it("prefers the stored mode over the flag once one is set", () => {
    expect(readAutopilotSettings({ ai_director_full_auto: { enabled: true, mode: "semi_auto" } }).mode).toBe("semi_auto")
  })

  it("ignores a mode it does not recognise", () => {
    expect(readAutopilotSettings({ ai_director_full_auto: { mode: "turbo" } }).mode).toBe("manual")
  })

  it("round-trips through the metadata it writes, leaving the rest of it alone", () => {
    const metadata = { basic_settings: { aspectRatio: "9:16" }, ai_director_full_auto: { allow_destructive_actions: false } }
    const next = writeAutopilotSettings(metadata, { mode: "semi_auto", budget: { maxSteps: 12, maxCredits: 300, maxBatchShots: 8 } })
    expect(next.basic_settings).toEqual({ aspectRatio: "9:16" })
    expect((next.ai_director_full_auto as Record<string, unknown>).allow_destructive_actions).toBe(false)
    expect((next.ai_director_full_auto as Record<string, unknown>).enabled).toBe(false)
    expect(readAutopilotSettings(next)).toEqual({ mode: "semi_auto", budget: { maxSteps: 12, maxCredits: 300, maxBatchShots: 8 } })
  })
})

describe("autopilotActionsFrom", () => {
  // The stage travels on the action payload and is the whole basis for what a
  // mode may run. Reading it from the wrong place silently automates nothing,
  // which is why the shape the chat route actually stores is asserted here.
  const stored = [
    { type: "tool_execution", tool: "submit_generation", label: "Generating", status: "completed" },
    {
      type: "suggested_actions",
      actions: [
        { id: "pipeline-keyframe-2", label: "Generate the image for shot 2", intent: "Generate the keyframe for shot 2.", risk: "costly", recommended: true, payload: { stage: "keyframes", summary: "1 of 4 shots has a keyframe." } },
        { id: "pipeline-video-1", label: "Generate the video for shot 1", intent: "Render shot 1.", risk: "costly", recommended: false, payload: { stage: "keyframes" } },
      ],
    },
  ]

  it("reads the actions, their risk, and the stage each one belongs to", () => {
    expect(autopilotActionsFrom(stored)).toEqual([
      { id: "pipeline-keyframe-2", label: "Generate the image for shot 2", intent: "Generate the keyframe for shot 2.", risk: "costly", recommended: true, stage: "keyframes" },
      { id: "pipeline-video-1", label: "Generate the video for shot 1", intent: "Render shot 1.", risk: "costly", recommended: false, stage: "keyframes" },
    ])
  })

  it("drives the policy end to end from what the reply stored", () => {
    expect(decide("semi_auto", { actions: autopilotActionsFrom(stored) }))
      .toMatchObject({ action: "run", intent: "Generate the keyframe for shot 2." })
  })

  it("takes the newest block when a reply carried more than one", () => {
    const actions = autopilotActionsFrom([
      { type: "suggested_actions", actions: [{ id: "old", label: "Old", intent: "Old step.", risk: "write", recommended: true, payload: { stage: "storyboard" } }] },
      { type: "suggested_actions", actions: [{ id: "new", label: "New", intent: "New step.", risk: "write", recommended: true, payload: { stage: "keyframes" } }] },
    ])
    expect(actions.map((action) => action.id)).toEqual(["new"])
  })

  it("is empty for a reply with no step, and for anything unparseable", () => {
    expect(autopilotActionsFrom(null)).toEqual([])
    expect(autopilotActionsFrom([{ type: "media_result", media: [{ type: "image", url: "https://example.test/a.png" }] }])).toEqual([])
    expect(autopilotActionsFrom("not a timeline")).toEqual([])
  })

  it("leaves the stage undefined when the payload has none, so the run hands back", () => {
    const actions = autopilotActionsFrom([
      { type: "suggested_actions", actions: [{ id: "x", label: "Do it", intent: "Do it.", risk: "costly", recommended: true }] },
    ])
    expect(actions[0].stage).toBeUndefined()
    expect(decide("full_auto", { actions })).toMatchObject({ action: "stop", reason: "stage-not-automatic" })
  })
})

describe("autopilotInstructionBlock", () => {
  it("says nothing in manual, so a normal turn is unchanged", () => {
    expect(autopilotInstructionBlock("manual")).toBe("")
  })

  it("stops the reply instructing someone who is not there to press anything", () => {
    const block = autopilotInstructionBlock("full_auto")
    expect(block).toContain("not as an instruction to press or click anything")
    expect(block).toContain("through the shot videos")
  })

  it("tells semi-auto to hand back at the video, and to keep asking about the user's own calls", () => {
    const block = autopilotInstructionBlock("semi_auto")
    expect(block).toContain("Videos are not part of this run")
    expect(block).toContain("genuinely the user's")
  })
})

describe("usableAutopilotActions", () => {
  const step = [action("keyframes", { label: "Generate the image for shot 2" })]

  it("uses a step from a reply it has not acted on yet", () => {
    expect(usableAutopilotActions(step, "reply-1", null)).toEqual(step)
  })

  it("will not replay the step it already took from that reply", () => {
    // This is the second render of a frame that already exists: the block still
    // says "shot 2" because approving a card writes no new reply.
    expect(usableAutopilotActions(step, "reply-1", "reply-1")).toEqual([])
  })

  it("uses the step again as soon as a newer reply carries one", () => {
    expect(usableAutopilotActions(step, "reply-2", "reply-1")).toEqual(step)
  })

  it("treats a session with no reply at all as having no step", () => {
    expect(usableAutopilotActions(step, null, null)).toEqual([])
    expect(usableAutopilotActions(step, undefined, undefined)).toEqual([])
  })

  it("asks for the next step rather than repeating a spent one", () => {
    // The two halves together: a spent block leaves no action, and no action in
    // an auto mode is what sends the run back to the Director for live state.
    const spent = usableAutopilotActions(step, "reply-1", "reply-1")
    expect(decide("semi_auto", { actions: spent })).toMatchObject({ action: "run", reason: "resume" })
  })
})

describe("a mode remembered from an earlier visit", () => {
  it("does not start spending on its own when the page is merely opened", () => {
    const decision = decide("full_auto", { engaged: false, actions: [action("keyframes")] })
    expect(decision).toEqual({ action: "stop", reason: "not-started", notice: null })
  })

  it("picks up as soon as the user takes part", () => {
    expect(decide("full_auto", { engaged: true, actions: [action("keyframes")] }).action).toBe("run")
  })

  it("will not approve a waiting card before the user takes part either", () => {
    expect(decide("full_auto", { engaged: false, pendingProposals: [proposal()] }).action).toBe("stop")
  })
})

describe("batching the shot images", () => {
  const board = (awaiting: number[], budget = defaultAutopilotBudget) =>
    decide("semi_auto", { actions: [action("keyframes")], shotsAwaitingImage: awaiting, budget })

  it("asks for every outstanding image in one request instead of one turn per frame", () => {
    const decision = board([2, 3, 4, 5])
    expect(decision).toMatchObject({ action: "run", label: "Generate 4 shot images" })
    expect(decision.action === "run" && decision.intent).toContain("shot 2, 3, 4, 5 in one batch")
  })

  it("does the same in full auto", () => {
    expect(decideAutopilot({ ...idle, mode: "full_auto", actions: [action("keyframes")], shotsAwaitingImage: [1, 2] }))
      .toMatchObject({ action: "run", label: "Generate 2 shot images" })
  })

  it("tells the batch never to include a shot that already has an image", () => {
    // Every generation is charged. A shot in the batch that is already rendered
    // is money spent on a picture the user has.
    const decision = board([2, 3])
    expect(decision.action === "run" && decision.intent).toContain("do not include a shot that already has an image")
    expect(decision.action === "run" && decision.intent).toContain("paid for twice")
  })

  it("never lets one approval commit more than the batch bound", () => {
    const decision = board([1, 2, 3, 4, 5, 6, 7, 8], { ...defaultAutopilotBudget, maxBatchShots: 3 })
    expect(decision.action === "run" && decision.intent).toContain("shot 1, 2, 3 in one batch")
    expect(decision.action === "run" && decision.intent).not.toContain("4")
  })

  it("charges for each shot once even if the workspace lists one twice", () => {
    expect(autopilotImageBatch({ ...idle, mode: "semi_auto", shotsAwaitingImage: [2, 2, 3] })).toEqual([2, 3])
  })

  it("falls back to the pipeline's own single step when only one shot is left", () => {
    const decision = board([4])
    expect(decision).toMatchObject({ action: "run", label: "Do the keyframes step" })
  })

  it("falls back to the single step when the workspace sent no shot list", () => {
    expect(decide("semi_auto", { actions: [action("keyframes")] })).toMatchObject({ action: "run", label: "Do the keyframes step" })
  })

  it("never batches the clips, so Stop can still save the user money", () => {
    // A clip costs many times a frame. Serial video means stopping after one
    // prevents the next from being committed; a batch would already have.
    const decision = decideAutopilot({ ...idle, mode: "full_auto", actions: [action("videos")], shotsAwaitingImage: [3, 4, 5] })
    expect(decision).toMatchObject({ action: "run", label: "Do the videos step" })
  })

  it("still refuses the batch when it would pass the run's credit cap", () => {
    // The bound limits how many shots one approval covers; the cap still limits
    // what the whole run may spend, and it is checked when the card arrives.
    const decision = decide("semi_auto", { creditsCommitted: 490, pendingProposals: [proposal({ estimatedCredits: 60 })] })
    expect(decision).toMatchObject({ action: "stop", reason: "credit-cap" })
    expect(decision.action === "stop" && decision.notice).toContain("60 credits")
  })

  it("still refuses the batch when the balance cannot cover it", () => {
    const decision = decide("semi_auto", { creditBalance: 20, pendingProposals: [proposal({ estimatedCredits: 132 })] })
    expect(decision).toMatchObject({ action: "stop", reason: "insufficient-credits" })
  })

  it("waits rather than batching over shots that are already rendering", () => {
    expect(decide("semi_auto", { inFlight: 1, actions: [action("keyframes")], shotsAwaitingImage: [3, 4] }))
      .toMatchObject({ action: "wait", reason: "generating" })
  })
})
