import { describe, expect, it } from "vitest"
import { computePipelineStage, emptySnapshot, missingEntityNames, pipelineInstructionBlock, withSkippedShots, type ProductionSnapshot } from "./pipeline"
import { parseBulkEntityImageIntent } from "./entity-image-workflow"
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
  it("asks for the script first", () => {
    const stage = computePipelineStage(emptySnapshot)
    expect(stage.key).toBe("script")
    expect(stage.nextAction?.label).toBe("Confirm the script")
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
    expect(parseBulkEntityImageIntent(stage.nextAction!.intent, [])).toBeNull()
  })

  it("sends the reference-art step down the bulk entity image path without regenerating", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      promptSheetEntityNames: ["Sana"],
      entities: [withoutArt("Sana")],
    }))
    expect(stage.key).toBe("entity_images")
    expect(parseBulkEntityImageIntent(stage.nextAction!.intent, [])?.regenerate).toBe(false)
  })

  it("sends the keyframe and video steps to their shot, not to the entity library", () => {
    const keyframe = computePipelineStage(snapshot({ hasScript: true, promptSheetCount: 3, shots: [shot(1, { hasKeyframe: true }), shot(2), shot(3)] }))
    expect(parseBulkEntityImageIntent(keyframe.nextAction!.intent, [])).toBeNull()
    expect(parseRequestedShotNumbers(keyframe.nextAction!.intent)).toEqual([2])

    const video = computePipelineStage(snapshot({ hasScript: true, promptSheetCount: 3, shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true })] }))
    expect(parseBulkEntityImageIntent(video.nextAction!.intent, [])).toBeNull()
    expect(parseRequestedShotNumbers(video.nextAction!.intent)).toEqual([2])
  })

  // After one shot finishes, the reply should say what is still outstanding and
  // offer the ways forward, rather than stopping and waiting to be asked again.
  it("reports what is left and offers the batch and the ready video", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true }), shot(3), shot(4)],
    }))
    expect(stage.key).toBe("keyframes")
    expect(stage.nextAction?.label).toBe("Generate the image for shot 3")
    expect(stage.summary).toContain("2 images and 3 videos still to generate.")
    expect(stage.alternatives.map((action) => action.label)).toEqual([
      "Generate the remaining 2 images",
      "Generate the video for shot 2",
    ])
  })

  it("offers the rest of the videos once every frame is approved", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2, { hasKeyframe: true }), shot(3, { hasKeyframe: true })],
    }))
    expect(stage.key).toBe("videos")
    expect(stage.nextAction?.label).toBe("Generate the video for shot 2")
    expect(stage.alternatives.map((action) => action.label)).toEqual(["Generate the remaining 2 videos"])
  })

  it("offers no batch when a single shot is left", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 2,
      shots: [shot(1, { hasKeyframe: true, hasVideo: true }), shot(2)],
    }))
    expect(stage.nextAction?.label).toBe("Generate the image for shot 2")
    expect(stage.alternatives).toEqual([])
  })

  it("keeps a batch image intent off the single-shot fast path", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 3,
      shots: [shot(1), shot(2), shot(3)],
    }))
    const batch = stage.alternatives.find((action) => action.id === "pipeline-keyframes-remaining")
    expect(parseRequestedShotNumbers(batch!.intent)).toEqual([1, 2, 3])
    expect(parseBulkEntityImageIntent(batch!.intent, [])).toBeNull()
  })

  // A shot mid-render still has no keyframe, so on stored state alone it reads
  // as the obvious next step — and pressing it pays for the same frame twice.
  it("never offers a shot that is already generating", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      shots: [
        shot(1, { hasKeyframe: true, hasVideo: true }),
        { ...shot(2), imageInFlight: true },
        shot(3),
      ],
    }))
    expect(stage.nextAction?.label).toBe("Generate the image for shot 3")
    expect(JSON.stringify(stage)).not.toContain("image for shot 2")
  })

  it("stops offering anything while every outstanding shot is rendering", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 2,
      shots: [
        { ...shot(1), imageInFlight: true },
        { ...shot(2), imageInFlight: true },
      ],
    }))
    expect(stage.title).toBe("Generating")
    expect(stage.nextAction).toBeNull()
    expect(stage.alternatives).toEqual([])
    expect(stage.summary).toContain("Shot 1, 2 are generating now")
  })

  it("does not call the episode finished while a clip is still rendering", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 1,
      shots: [{ ...shot(1, { hasKeyframe: true }), videoInFlight: true }],
    }))
    expect(stage.key).not.toBe("complete")
    expect(stage.nextAction).toBeNull()
  })

  it("keeps the batch button to the shots that are not already running", () => {
    const stage = computePipelineStage(snapshot({
      hasScript: true,
      promptSheetCount: 4,
      shots: [{ ...shot(1), imageInFlight: true }, shot(2), shot(3), shot(4)],
    }))
    const batch = stage.alternatives.find((action) => action.id === "pipeline-keyframes-remaining")
    expect(batch?.label).toBe("Generate the remaining 3 images")
    expect(parseRequestedShotNumbers(batch!.intent)).toEqual([2, 3, 4])
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
