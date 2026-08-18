import { calculateCreditCost } from "./credits"
import { describe, expect, it } from "vitest"
import { generationProvider, imageGenerationModels, isImageGenerationModel, isVideoGenerationModel, projectDirectorVideoModel, supportedVideoModel, videoGenerationModels, videoDurationOptions, videoModelMaxDuration } from "./generation-models"

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

describe("video pricing on the 2.2x rate card", () => {
  it("bills Seedance 2.5 at eighty-seven credits for every second", () => {
    expect(calculateCreditCost("fal-seedance-2-5", "video", 3)).toBe(261)
    expect(calculateCreditCost("fal-seedance-2-5", "video", 8)).toBe(696)
    expect(calculateCreditCost("dreamina-seedance-2-5-260628", "video", 10)).toBe(870)
  })

  it("prices Seedance 2.0 by resolution, not by a flat multiplier", () => {
    expect(calculateCreditCost("fal-seedance-2-0", "video", 5, { resolution: "480p" })).toBe(75)
    expect(calculateCreditCost("fal-seedance-2-0", "video", 5, { resolution: "720p" })).toBe(160)
    expect(calculateCreditCost("fal-seedance-2-0", "video", 5, { resolution: "1080p" })).toBe(390)
    expect(calculateCreditCost("fal-seedance-2-0", "video", 5, { resolution: "4K" })).toBe(825)
  })

  it("charges a longer clip for the seconds it actually renders", () => {
    // The old card quoted a flat five-second clip, so a four-second and a
    // five-second render cost the same and every second past five was free.
    expect(calculateCreditCost("fal-seedance-2-0", "video", 4, { resolution: "720p" })).toBe(128)
    expect(calculateCreditCost("fal-seedance-2-0", "video", 8, { resolution: "720p" })).toBe(256)
  })

  it("keeps a fractional per-second rate unrounded until the total", () => {
    // Veo 3.1 is 674 credits for eight seconds. Rounding its 84.25 rate up
    // first would bill 680 for the same clip.
    expect(calculateCreditCost("google-veo-3-1", "video", 8)).toBe(674)
    expect(calculateCreditCost("google-omni-flash", "video", 8)).toBe(169)
    expect(calculateCreditCost("fal-minimax-h3", "video", 8, { resolution: "720p" })).toBe(135)
    expect(calculateCreditCost("fal-minimax-h3", "video", 8, { resolution: "4K" })).toBe(220)
  })

  it("scales a variant the card does not quote off the Seedance 2.0 curve", () => {
    // Fast is quoted at 480p and 720p only; 4K must still cost more than 1080p,
    // or a 4K render bills at a fraction of what it costs to produce.
    const fast1080 = calculateCreditCost("fal-seedance-2-0-fast", "video", 1, { resolution: "1080p" })
    const fast4k = calculateCreditCost("fal-seedance-2-0-fast", "video", 1, { resolution: "4K" })
    expect(fast1080).toBe(64)
    expect(fast4k).toBeGreaterThan(fast1080)
    expect(fast4k).toBeLessThan(calculateCreditCost("fal-seedance-2-0", "video", 1, { resolution: "4K" }))
  })
})

describe("image pricing on the 2.2x rate card", () => {
  it("bills GPT Image 2 by its quality tier", () => {
    expect(calculateCreditCost("gpt-image-2", "image", 5, { quality: "Low" })).toBe(2)
    expect(calculateCreditCost("gpt-image-2", "image", 5, { quality: "Medium" })).toBe(12)
    expect(calculateCreditCost("gpt-image-2", "image", 5, { quality: "High" })).toBe(45)
  })

  it("bills Nano Banana by resolution and ignores the video duration", () => {
    expect(calculateCreditCost("google-nano-banana-2", "image", 30, { resolution: "720p" })).toBe(15)
    expect(calculateCreditCost("google-nano-banana-2", "image", 30, { resolution: "1080p" })).toBe(22)
    expect(calculateCreditCost("google-nano-banana-2", "image", 30, { resolution: "4K" })).toBe(32)
    expect(calculateCreditCost("google-nano-banana-2-pro", "image", 5, { resolution: "4K" })).toBe(51)
  })

  it("prices Seedream at its flat rate whatever the settings say", () => {
    expect(calculateCreditCost("dola-seedream-5-0-pro-260628", "image", 5, { quality: "Ultra", resolution: "4K" })).toBe(10)
  })

  it("falls back to the cheapest quoted tier for a model with no card entry", () => {
    expect(calculateCreditCost("some-unlisted-model", "image")).toBe(7)
    expect(calculateCreditCost("some-unlisted-model", "video", 8)).toBe(135)
  })
})

describe("AI Director video provider", () => {
  it("uses the project's saved BytePlus model", () => {
    expect(projectDirectorVideoModel({ metadata: { basic_settings: { videoModel: "dreamina-seedance-2-0-fast-260128" } } })).toBe("dreamina-seedance-2-0-fast-260128")
  })

  it("keeps a saved fal model now that Director execution supports it", () => {
    expect(projectDirectorVideoModel({ metadata: { basic_settings: { videoModel: "fal-seedance-2-5" } } })).toBe("fal-seedance-2-5")
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
