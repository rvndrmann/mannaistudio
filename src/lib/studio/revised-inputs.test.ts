import { describe, expect, it } from "vitest"
import { computePipelineStage, emptySnapshot, entitiesWithStaleArt, shotsBehindPromptSheet, shotsWithStaleKeyframe, type ProductionSnapshot } from "./pipeline"
import { artIsStale, keyframeIsStale } from "./project-state-summary"

const ready: ProductionSnapshot = {
  ...emptySnapshot,
  hasScript: true,
  promptSheetCount: 3,
  promptSheetEntityNames: ["Neon City Street"],
  entities: [{ name: "Neon City Street", type: "scene", hasReferenceImage: true }],
  shots: [
    { number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false },
    { number: 2, hasPrompt: true, hasKeyframe: false, hasVideo: false },
  ],
}

describe("artIsStale", () => {
  it("is exact once the description used at generation was recorded", () => {
    const metadata = { image_generation: { source_description: "Neon night street, wet asphalt." } }
    expect(artIsStale("Neon night street, wet asphalt.", metadata)).toBe(false)
    expect(artIsStale("Rainy New York morning street, cool gray-blue light.", metadata)).toBe(true)
  })

  it("falls back to the generation prompt for art made before that was recorded", () => {
    // The prompt wraps the description in framing and style text, so it
    // contains the description without ever equalling it.
    const metadata = { image_generation: { prompt: "Establishing plate. Neon night street, wet asphalt. Photoreal, 9:16." } }
    expect(artIsStale("Neon night street, wet asphalt.", metadata)).toBe(false)
    expect(artIsStale("Rainy New York morning street, cool gray-blue light.", metadata)).toBe(true)
  })

  it("says nothing when there is nothing to compare", () => {
    expect(artIsStale("", { image_generation: { prompt: "x" } })).toBe(false)
    expect(artIsStale("A street", null)).toBe(false)
    expect(artIsStale("A street", { image_generation: {} })).toBe(false)
  })
})

describe("keyframeIsStale", () => {
  it("compares the shot's prompt with the one the frame was made from", () => {
    expect(keyframeIsStale("Morning street", { image_generation: { prompt: "Morning street" } })).toBe(false)
    expect(keyframeIsStale("Morning street", { image_generation: { prompt: "Neon night street" } })).toBe(true)
  })

  it("is silent for a frame with no recorded prompt", () => {
    expect(keyframeIsStale("Morning street", { image_generation: {} })).toBe(false)
  })
})

describe("the pipeline puts revised inputs first", () => {
  it("offers to remake art the user's revision left behind", () => {
    // The reported case: the scene descriptions were changed to a New York
    // morning, the plates still showed neon night, and the button offered the
    // next shot — so the reply and the button disagreed.
    const snapshot: ProductionSnapshot = {
      ...ready,
      entities: [{ name: "Neon City Street", type: "scene", hasReferenceImage: true, artIsStale: true }],
    }
    const stage = computePipelineStage(snapshot)
    expect(entitiesWithStaleArt(snapshot)).toEqual(["Neon City Street"])
    expect(stage.title).toBe("Revised assets")
    expect(stage.nextAction?.label).toContain("Regenerate art for Neon City Street")
    expect(stage.nextAction?.intent).toContain("Do not change the descriptions")
  })

  it("offers to remake a keyframe whose prompt was edited after it was made", () => {
    const snapshot: ProductionSnapshot = {
      ...ready,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false, keyframeIsStale: true }],
    }
    expect(shotsWithStaleKeyframe(snapshot).map((shot) => shot.number)).toEqual([1])
    expect(computePipelineStage(snapshot).nextAction?.label).toContain("shot 1")
  })

  it("leaves the normal pipeline alone when nothing was revised", () => {
    expect(computePipelineStage(ready).title).not.toBe("Revised assets")
  })

  it("does not offer a stale frame that is already being regenerated", () => {
    const snapshot: ProductionSnapshot = {
      ...ready,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false, keyframeIsStale: true, imageInFlight: true }],
    }
    expect(shotsWithStaleKeyframe(snapshot)).toEqual([])
  })
})

describe("a prepared change nobody answered", () => {
  it("becomes the next step, because nothing moves until it is decided", () => {
    // The reported case: the Director had rewritten six prompts and prepared
    // three location updates, the workspace still showed the old neon night,
    // and the reason was three approval cards nobody had been pointed at.
    const stage = computePipelineStage({ ...ready, pendingApprovals: 3 })
    expect(stage.title).toBe("Waiting on you")
    expect(stage.nextAction?.label).toBe("Review 3 pending changes")
    expect(stage.summary).toContain("Nothing regenerates until")
  })

  it("reads correctly for a single change", () => {
    const stage = computePipelineStage({ ...ready, pendingApprovals: 1 })
    expect(stage.nextAction?.label).toBe("Review 1 pending change")
  })

  it("outranks revised art, which cannot be remade until the change is approved", () => {
    const stage = computePipelineStage({
      ...ready,
      pendingApprovals: 2,
      entities: [{ name: "Neon City Street", type: "scene", hasReferenceImage: true, artIsStale: true }],
    })
    expect(stage.title).toBe("Waiting on you")
  })

  it("stays out of the way when there is nothing pending", () => {
    expect(computePipelineStage({ ...ready, pendingApprovals: 0 }).title).not.toBe("Waiting on you")
  })
})

describe("shots the prompt sheet has moved past", () => {
  const written = Date.parse("2026-08-18T10:00:00Z")
  const revised = Date.parse("2026-08-18T11:00:00Z")

  it("catches the plan and the shots disagreeing", () => {
    // The reported state: the prompt sheet and the locations said rainy New
    // York morning, the shot prompts still said neon night, and the buttons
    // offered to generate from the night prompts anyway.
    const snapshot: ProductionSnapshot = {
      ...ready,
      promptSheetRevisedAt: revised,
      shots: [
        { number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false, promptUpdatedAt: written },
        { number: 2, hasPrompt: true, hasKeyframe: true, hasVideo: false, promptUpdatedAt: written },
      ],
    }
    expect(shotsBehindPromptSheet(snapshot).map((shot) => shot.number)).toEqual([1, 2])
    const stage = computePipelineStage(snapshot)
    expect(stage.title).toBe("Shots behind the plan")
    expect(stage.nextAction?.label).toBe("Bring shot 1, 2 up to the plan")
    // Bringing the prompts in line must not quietly spend credits.
    expect(stage.nextAction?.risk).toBe("write")
    expect(stage.nextAction?.intent).toContain("Do not generate any image or video")
  })

  it("leaves shots that were written after the revision alone", () => {
    const snapshot: ProductionSnapshot = {
      ...ready,
      promptSheetRevisedAt: revised,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false, promptUpdatedAt: revised + 1_000 }],
    }
    expect(shotsBehindPromptSheet(snapshot)).toEqual([])
  })

  it("says nothing when the sheet has never been revised", () => {
    expect(shotsBehindPromptSheet({ ...ready, promptSheetRevisedAt: 0 })).toEqual([])
  })

  it("still puts a pending approval first", () => {
    const stage = computePipelineStage({
      ...ready,
      pendingApprovals: 1,
      promptSheetRevisedAt: revised,
      shots: [{ number: 1, hasPrompt: true, hasKeyframe: true, hasVideo: false, promptUpdatedAt: written }],
    })
    expect(stage.title).toBe("Waiting on you")
  })
})
