import { describe, expect, it } from "vitest"
import { computePipelineStage, emptySnapshot, missingEntityNames, pipelineInstructionBlock, withSkippedShots, type ProductionSnapshot } from "./pipeline"
import { parseRequestedShotNumbers } from "./shot-intent"

function snapshot(patch: Partial<ProductionSnapshot> = {}): ProductionSnapshot {
  return { ...emptySnapshot, ...patch }
}

const withArt = (name: string, type = "character") => ({ name, type, hasReferenceImage: true })
const withoutArt = (name: string, type = "character") => ({ name, type, hasReferenceImage: false })
const shot = (number: number, patch: { hasKeyframe?: boolean; hasVideo?: boolean; hasPrompt?: boolean } = {}) => ({
  number,
  hasPrompt: patch.hasPrompt ?? true,
  hasKeyframe: patch.hasKeyframe ?? false,
  hasVideo: patch.hasVideo ?? false,
})

describe("production pipeline stages", () => {
  // "Confirm the script" was offered when no script existed, which is the one
  // thing that cannot be done at this stage. A button has to name what pressing
  // it does, so the two real routes to a script are the two buttons.
  it("offers the two ways to get a script, and never offers to confirm one that does not exist", () => {
    const stage = computePipelineStage(emptySnapshot)
    expect(stage.key).toBe("script")
    expect(stage.nextAction?.label).toBe("Write the script from my idea")
    expect(stage.alternatives.map((action) => action.label)).toContain("I'll paste my own script")
    expect(stage.nextAction?.label).not.toContain("Confirm")
  })

  // Someone who has just made a character and wants her portrait was shown the
  // script step and nothing else, because reference art is a later stage.
  it("keeps started asset work reachable while the script is still missing", () => {
    const stage = computePipelineStage(snapshot({ entities: [withoutArt("Sara")] }))
    expect(stage.key).toBe("script")
    expect(stage.alternatives.map((action) => action.label)).toContain("Generate reference art for Sara")
  })

  it("writes the prompt sheet once a script is saved", () => {
    const stage = computePipelineStage(snapshot({ hasScript: true }))
    expect(stage.key).toBe("prompt_sheet")
    expect(stage.nextAction?.intent).toContain("Prompt Agent")
  })

  it("creates only the characters the prompt sheet names and the project lacks", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      promptSheetEntityNames: ["Detective Rao", "Neon Alley", "detective rao", "Sana"],
      entities: [withArt("Detective Rao"), withArt("Neon Alley", "scene")],
    }))
    expect(stage.key).toBe("entities")
    expect(stage.nextAction?.label).toBe("Create 1 missing asset")
    expect(stage.nextAction?.intent).toContain("Sana")
    expect(stage.nextAction?.intent).not.toContain("Neon Alley")
  })

  it("treats a name that differs only in case or spacing as already created", () => {
    expect(missingEntityNames(snapshot({
      promptSheetEntityNames: ["detective  rao", "DETECTIVE RAO"],
      entities: [withArt("Detective Rao")],
    }))).toEqual([])
  })

  it("generates reference art only for entities that have none", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      promptSheetEntityNames: ["Detective Rao", "Sana"],
      entities: [withArt("Detective Rao"), withoutArt("Sana")],
    }))
    expect(stage.key).toBe("entity_images")
    expect(stage.nextAction?.risk).toBe("costly")
    expect(stage.nextAction?.intent).toContain("Sana")
    expect(stage.nextAction?.intent).not.toContain("Detective Rao")
  })

  it("builds the storyboard once every named asset exists with art", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 6,
      promptSheetEntityNames: ["Detective Rao"],
      entities: [withArt("Detective Rao")],
    }))
    expect(stage.key).toBe("storyboard")
    expect(stage.nextAction?.label).toBe("Build the storyboard (6 shots)")
  })

  it("keyframes one shot at a time, lowest numbered first", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      entities: [withArt("Detective Rao")],
      shots: [shot(1, { hasKeyframe: true }), shot(2), shot(3)],
    }))
    expect(stage.key).toBe("keyframes")
    expect(stage.nextAction?.label).toBe("Generate the image for shot 2")
    expect(stage.summary).toContain("1 of 3")
  })

  it("only reaches video for a shot that already has its keyframe", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 2,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true })],
    }))
    expect(stage.key).toBe("videos")
    expect(stage.nextAction?.label).toBe("Generate the video for shot 2")
  })

  it("does not stall on a shot that has no prompt to render", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 2,
      shots: [shot(1, { hasPrompt: false }), shot(2, { hasKeyframe: true })],
    }))
    expect(stage.key).toBe("videos")
    expect(stage.nextAction?.label).toBe("Generate the video for shot 2")
  })

  it("ends on review when every shot is keyframed and rendered", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 1,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true })],
    }))
    expect(stage.key).toBe("complete")
    expect(stage.nextAction?.risk).toBe("read")
  })

  // The button sends its intent through the same matching as a typed message,
  // so a stage whose wording lands on the wrong handler quietly does the wrong
  // work — asset art instead of new assets, entity art instead of a keyframe.
  it("keeps the create-assets step off the reference-art path", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      promptSheetEntityNames: ["Sana"],
      entities: [withArt("Detective Rao")],
    }))
    expect(stage.key).toBe("entities")
  })

  it("sends the reference-art step down the bulk entity image path without regenerating", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      promptSheetEntityNames: ["Sana"],
      entities: [withoutArt("Sana")],
    }))
    expect(stage.key).toBe("entity_images")
  })

  it("sends the keyframe and video steps to their shot, not to the entity library", () => {
    const keyframe = computePipelineStage(snapshot({ hasScript: true, promptSheetCount: 3, shots: [shot(1, { hasKeyframe: true }), shot(2), shot(3)] }))
    expect(parseRequestedShotNumbers(keyframe.nextAction!.intent)).toEqual([2])

    const video = computePipelineStage(snapshot({ hasScript: true, promptSheetCount: 3, shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true })] }))
    expect(parseRequestedShotNumbers(video.nextAction!.intent)).toEqual([2])
  })

  // After one shot finishes, the reply should say what is still outstanding and
  // offer the ways forward, rather than stopping and waiting to be asked again.
  it("reports what is left and offers the next shot image and ready video", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true }), shot(3), shot(4)],
    }))
    expect(stage.key).toBe("keyframes")
    expect(stage.nextAction?.label).toBe("Generate the image for shot 3")
    expect(stage.summary).toContain("2 images and 3 videos still to generate.")
    // Redoing from the same prompt returns the same picture, so a frame the user
    // dislikes also needs a way to change the prompt before spending again.
    expect(stage.alternatives.map((action) => action.label)).toEqual([
      "Generate the video for shot 2",
      "Regenerate the image for shot 2",
      "Change shot 2's prompt first",
    ])
  })

  it("offers next video as primary action and regenerate previous video as alternative", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true }), shot(3, { hasKeyframe: true })],
    }))
    expect(stage.key).toBe("videos")
    expect(stage.nextAction?.label).toBe("Generate the video for shot 2")
    expect(stage.alternatives.map((action) => action.label)).toEqual(["Regenerate the video for shot 1"])
  })

  it("offers review as primary action and regenerate last shot as alternative when complete", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [
        shot(1, { hasKeyframe: true, hasVideo: true }),
        shot(2, { hasKeyframe: true, hasVideo: true }),
        shot(3, { hasKeyframe: true, hasVideo: true }),
      ],
    }))
    expect(stage.key).toBe("complete")
    expect(stage.nextAction?.label).toBe("Review the cut for continuity")
    expect(stage.alternatives.map((action) => action.label)).toEqual(["Regenerate the video for shot 3"])
  })

  it("keeps a single shot image intent on the shot path", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [shot(1), shot(2), shot(3)],
    }))
    const alt = stage.alternatives.find((action) => action.id === "pipeline-keyframe-2")
    expect(parseRequestedShotNumbers(alt!.intent)).toEqual([2])
  })

  // "Skip shot 6 and continue" names a shot in order to exclude it. Left to the
  // agent it came back as an inspection report on an unrelated shot.
  it("moves past a shot the user skipped", () => {
    const base = snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true }), shot(3, { hasKeyframe: true })],
    })
    expect(computePipelineStage(base).nextAction?.label).toBe("Generate the video for shot 2")
    const stage = computePipelineStage(withSkippedShots(base, [2]))
    expect(stage.nextAction?.label).toBe("Generate the video for shot 3")
    expect(JSON.stringify(stage.alternatives)).not.toContain("shot 2")
  })

  it("has nothing left to offer when the only outstanding shot is skipped", () => {
    const stage = computePipelineStage(withSkippedShots(snapshot({
      hasScript: true,
      promptSheetCount: 2,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true })],
    }), [2]))
    expect(stage.nextAction?.risk).toBe("read")
  })

  it("tells the Director which button the user is looking at", () => {
    const block = pipelineInstructionBlock(snapshot({ hasScript: true }))
    expect(block).toContain("Write the prompt sheet")
    expect(block).toContain("Never tell the user to open a tab")
  })
})

describe("a blocking approval is surfaced before anything else", () => {
  // The Director refused to generate Sara's reference art because her record was
  // pending approval, while the next-step block said "no script yet" — so the
  // one thing standing in the way was the one thing never mentioned.
  it("asks for the pending change even when the episode has no script", () => {
    const stage = computePipelineStage(snapshot({ pendingApprovals: 1, entities: [withoutArt("Sara")] }))
    expect(stage.title).toBe("Waiting on you")
    expect(stage.nextAction?.label).toBe("Review 1 pending change")
  })

  it("still asks for it once a script and prompt sheet exist", () => {
    const stage = computePipelineStage(snapshot({ hasScript: true, promptSheetCount: 3, pendingApprovals: 2 }))
    expect(stage.nextAction?.label).toBe("Review 2 pending changes")
  })
})
