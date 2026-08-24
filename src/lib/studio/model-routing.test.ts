import { describe, expect, it } from "vitest"
import { generationRequestSchema, generationShotCount, routeGeneration } from "./model-routing"

const shotId = "11111111-1111-4111-8111-111111111111"
const episodeId = "22222222-2222-4222-8222-222222222222"

describe("generation request shot addressing", () => {
  it("accepts shots named by storyboard number when the episode is given", () => {
    const request = generationRequestSchema.parse({ type: "video", shotNumbers: [2], episodeId })
    expect(request.shotIds).toEqual([])
    expect(request.shotNumbers).toEqual([2])
  })

  it("rejects shot numbers without an episode to resolve them against", () => {
    expect(() => generationRequestSchema.parse({ type: "video", shotNumbers: [2] })).toThrow()
  })

  it("keeps reference shot numbers separate from target shot numbers", () => {
    const request = generationRequestSchema.parse({ type: "video", shotNumbers: [2], videoReferenceShotNumbers: [1], episodeId })
    expect(request.shotNumbers).toEqual([2])
    expect(request.videoReferenceShotNumbers).toEqual([1])
    expect(generationShotCount(request)).toBe(1)
  })

  it("allows a request that names no shots, so a cost estimate can quote a price first", () => {
    // submit_generation enforces the requirement itself; estimate_generation_cost
    // shares this schema and legitimately runs before any shot is chosen.
    const request = generationRequestSchema.parse({ type: "video" })
    expect(request.shotIds).toEqual([])
    expect(routeGeneration(request).estimatedCredits).toBe(routeGeneration(request).creditsPerShot)
  })

  it("counts unresolved shot numbers so estimates stay correct before lookup", () => {
    const request = generationRequestSchema.parse({ type: "video", shotNumbers: [1, 2, 3], episodeId })
    expect(generationShotCount(request)).toBe(3)
    expect(routeGeneration(request).estimatedCredits).toBe(routeGeneration(request).creditsPerShot * 3)
  })
})

describe("explicit model selection", () => {
  it("uses the requested model instead of preference scoring", () => {
    const routing = routeGeneration({ type: "image", shotIds: [shotId], model: "gpt-image-1.5" })
    expect(routing.selected.model).toBe("gpt-image-1.5")
    expect(routing.reason).toContain("explicitly")
  })

  it("routes Google and fal models explicitly", () => {
    expect(routeGeneration({ type: "image", shotIds: [shotId], model: "google-nano-banana-2" }).selected.provider).toBe("google")
    expect(routeGeneration({ type: "video", shotIds: [shotId], model: "fal-seedance-2-5" }).selected.provider).toBe("fal")
  })

  it("uses the shared rate card for the chosen variant", () => {
    expect(routeGeneration({ type: "video", shotIds: [shotId], model: "fal-seedance-2-5", durationSeconds: 4 }).creditsPerShot).toBe(348)
    expect(routeGeneration({ type: "image", shotIds: [shotId], model: "google-nano-banana-2", resolution: "1080p" }).creditsPerShot).toBe(22)
  })

  it("refuses a model that cannot serve the request", () => {
    expect(() => routeGeneration({ type: "video", shotIds: [shotId], model: "gpt-image-2" })).toThrow(/does not support/)
  })
})

describe("existing frame reference", () => {
  it("is off unless asked for", () => {
    expect(generationRequestSchema.parse({ type: "image", shotIds: [shotId] }).useExistingFrame).toBe(false)
  })

  it("can be turned on when the user wants the current composition kept", () => {
    expect(generationRequestSchema.parse({ type: "image", shotIds: [shotId], useExistingFrame: true }).useExistingFrame).toBe(true)
  })
})

/**
 * A shot whose script has spoken lines is described as dialogueRequired, and
 * that travels on the request whatever is being generated. Dialogue is a video
 * capability — no image model reports it — so applying it to an image request
 * emptied the candidate list, and asking for a storyboard frame failed with "No
 * configured model supports this shot request" for a frame every image model
 * could render.
 */
describe("dialogue only narrows a video request", () => {
  const shotId = "22222222-2222-4222-8222-222222222222"

  it("routes a storyboard image for a shot that has dialogue", () => {
    const routing = routeGeneration({ type: "image", shotIds: [shotId], dialogueRequired: true, referenceImageRequired: true })
    expect(routing.selected.types).toContain("image")
  })

  it("honours an explicitly picked image model on a dialogue shot", () => {
    const routing = routeGeneration({ type: "image", shotIds: [shotId], dialogueRequired: true, referenceImageRequired: true, model: "gpt-image-2" })
    expect(routing.selected.model).toBe("gpt-image-2")
  })

  it("still requires a dialogue-capable model for video", () => {
    const routing = routeGeneration({ type: "video", shotIds: [shotId], dialogueRequired: true })
    expect(routing.selected.dialogue).toBe(true)
  })
})
