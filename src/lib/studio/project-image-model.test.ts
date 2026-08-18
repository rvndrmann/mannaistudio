import { describe, expect, it } from "vitest"
import { projectCharacterImageModel, projectStoryboardImageModel } from "./project-image-model"
import { imageGenerationModels } from "./generation-models"

const project = (basic: Record<string, unknown>) => ({ metadata: { basic_settings: basic } })

describe("projectStoryboardImageModel", () => {
  it("uses the model the project picked, instead of a hardcoded one", () => {
    // The Director rendered every keyframe on gpt-image-2 regardless of this
    // setting, so a project set to Nano Banana still got GPT Image.
    expect(projectStoryboardImageModel(project({ storyboardImageModel: "google-nano-banana-2" }))).toBe("google-nano-banana-2")
  })

  it("falls back to a general image model setting before the default", () => {
    expect(projectStoryboardImageModel(project({ imageModel: "google-nano-banana-2-pro" }))).toBe("google-nano-banana-2-pro")
  })

  it("ignores a model that is no longer offered rather than sending it to a provider", () => {
    expect(projectStoryboardImageModel(project({ storyboardImageModel: "retired-model" }))).toBe(imageGenerationModels[0].id)
  })

  it("defaults for a project with no settings at all", () => {
    expect(projectStoryboardImageModel(null)).toBe(imageGenerationModels[0].id)
    expect(projectStoryboardImageModel({})).toBe(imageGenerationModels[0].id)
  })
})

describe("projectCharacterImageModel", () => {
  it("has its own setting, because reference art and keyframes are different jobs", () => {
    const settings = project({ storyboardImageModel: "gpt-image-2", characterImageModel: "google-nano-banana-2-pro" })
    expect(projectCharacterImageModel(settings)).toBe("google-nano-banana-2-pro")
    expect(projectStoryboardImageModel(settings)).toBe("gpt-image-2")
  })

  it("follows the storyboard model when it has no setting of its own", () => {
    expect(projectCharacterImageModel(project({ storyboardImageModel: "google-nano-banana-2" }))).toBe("google-nano-banana-2")
  })
})
