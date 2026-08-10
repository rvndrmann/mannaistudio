import { describe, expect, it } from "vitest"
import { generationProvider, imageGenerationModels, isImageGenerationModel, isVideoGenerationModel, videoGenerationModels } from "./generation-models"

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
