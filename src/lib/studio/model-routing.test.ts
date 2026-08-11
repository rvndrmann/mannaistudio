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

  it("rejects a request that names no shots at all", () => {
    expect(() => generationRequestSchema.parse({ type: "video" })).toThrow()
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

  it("refuses a model that cannot serve the request", () => {
    expect(() => routeGeneration({ type: "video", shotIds: [shotId], model: "gpt-image-2" })).toThrow(/does not support/)
  })
})
