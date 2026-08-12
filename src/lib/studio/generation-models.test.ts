import { calculateCreditCost } from "./credits"
import { describe, expect, it } from "vitest"
import { generationProvider, imageGenerationModels, isImageGenerationModel, isVideoGenerationModel, videoGenerationModels, videoDurationOptions, videoModelMaxDuration } from "./generation-models"

describe("studio generation model registry", () => {
  it("exposes Seedream 5.0 Pro through BytePlus", () => {
    const seedream = imageGenerationModels.find((model) => model.label === "Seedream 5.0 Pro")
    expect(seedream?.id).toBe("dola-seedream-5-0-pro-260628")
    expect(seedream && generationProvider(seedream.id)).toBe("byteplus")
    expect(isImageGenerationModel(seedream?.id)).toBe(true)
  })

  it("exposes BytePlus Seedance video models", () => {
    const bytePlusModels = videoGenerationModels.filter((model) => model.provider === "byteplus")
    expect(bytePlusModels.map((model) => model.id)).toEqual([
      "dreamina-seedance-2-5-260628",
      "dreamina-seedance-2-0-260128",
      "dreamina-seedance-2-0-fast-260128",
      "dreamina-seedance-2-0-mini-260615",
    ])
    expect(bytePlusModels.every((model) => generationProvider(model.id) === "byteplus" && isVideoGenerationModel(model.id))).toBe(true)
  })

  it("rejects unknown model identifiers", () => {
    expect(isImageGenerationModel("seedream-latest")).toBe(false)
    expect(isVideoGenerationModel("seedance-latest")).toBe(false)
  })
})

describe("Seedance 2.5 pricing", () => {
  it("bills fifty credits for every second of the clip", () => {
    expect(calculateCreditCost("fal-seedance-2-5", "video", 3)).toBe(150)
    expect(calculateCreditCost("fal-seedance-2-5", "video", 4)).toBe(200)
    expect(calculateCreditCost("dreamina-seedance-2-5-260628", "video", 10)).toBe(500)
  })

  it("leaves per-video models on their own scale", () => {
    // Seedance 2.0 stays flat to five seconds, so the per-second rule must not
    // leak into models that are not priced that way.
    expect(calculateCreditCost("fal-seedance-2-0", "video", 4)).toBe(calculateCreditCost("fal-seedance-2-0", "video", 5))
  })
})

describe("video duration limits", () => {
  it("gives Seedance 2.5 thirty seconds and everything else fifteen", () => {
    expect(videoModelMaxDuration("fal-seedance-2-5")).toBe(30)
    expect(videoModelMaxDuration("dreamina-seedance-2-5-260628")).toBe(30)
    expect(videoModelMaxDuration("fal-seedance-2-0")).toBe(15)
    expect(videoModelMaxDuration("dreamina-seedance-2-0-fast-260128")).toBe(15)
    expect(videoModelMaxDuration("dreamina-seedance-2-0-mini-260615")).toBe(15)
  })

  it("never offers a length the model cannot render", () => {
    expect(videoDurationOptions("fal-seedance-2-5")).toContain(30)
    expect(videoDurationOptions("fal-seedance-2-0").every((s) => s <= 15)).toBe(true)
    expect(videoDurationOptions("fal-seedance-2-0")).not.toContain(30)
  })
})
