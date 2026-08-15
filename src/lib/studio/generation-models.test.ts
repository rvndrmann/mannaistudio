import { calculateCreditCost } from "./credits"
import { describe, expect, it } from "vitest"
import { defaultDirectorVideoModel, generationProvider, imageGenerationModels, isImageGenerationModel, isVideoGenerationModel, projectDirectorVideoModel, supportedVideoModel, videoGenerationModels, videoDurationOptions, videoModelMaxDuration } from "./generation-models"

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

  it("no longer offers the Hunyuan and Luma series", () => {
    expect(videoGenerationModels.some((model) => /hunyuan|luma/i.test(model.id))).toBe(false)
    expect(isVideoGenerationModel("fal-hunyuan-video")).toBe(false)
    expect(isVideoGenerationModel("fal-luma-dream-machine")).toBe(false)
  })

  it("resolves a retired model still saved on a project to one that is offered", () => {
    // Left alone, a stored "fal-hunyuan-video" priced at the flat fallback and
    // rendered on whatever fal.ts defaulted to, with nothing saying so.
    expect(supportedVideoModel("fal-hunyuan-video")).toBe(videoGenerationModels[0].id)
    expect(supportedVideoModel("fal-luma-dream-machine")).toBe(videoGenerationModels[0].id)
    expect(supportedVideoModel(undefined)).toBe(videoGenerationModels[0].id)
    expect(isVideoGenerationModel(supportedVideoModel("anything at all"))).toBe(true)
  })

  it("leaves a model that is still offered alone", () => {
    expect(supportedVideoModel("dreamina-seedance-2-5-260628")).toBe("dreamina-seedance-2-5-260628")
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

describe("AI Director video provider", () => {
  it("uses the project's saved BytePlus model", () => {
    expect(projectDirectorVideoModel({ metadata: { basic_settings: { videoModel: "dreamina-seedance-2-0-fast-260128" } } })).toBe("dreamina-seedance-2-0-fast-260128")
  })

  it("falls back to BytePlus Seedance 2.5 instead of fal", () => {
    expect(projectDirectorVideoModel({ metadata: { basic_settings: { videoModel: "fal-seedance-2-5" } } })).toBe(defaultDirectorVideoModel)
    expect(projectDirectorVideoModel({})).toBe("dreamina-seedance-2-5-260628")
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
