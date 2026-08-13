import { describe, expect, it } from "vitest"
import { forbidsImageGeneration, forbidsMediaGeneration, forbidsVideoGeneration } from "./media-intent"

describe("media generation negation", () => {
  it.each([
    "Do not generate or change anything.",
    "Inspect only — confirm whether the keyframe exists.",
    "Read-only review of shot 1",
    "Without generating, inspect the storyboard",
  ])("keeps %s read-only", (message) => {
    expect(forbidsMediaGeneration(message)).toBe(true)
    expect(forbidsImageGeneration(message)).toBe(true)
    expect(forbidsVideoGeneration(message)).toBe(true)
  })

  it("allows an affirmative regenerate request", () => {
    expect(forbidsMediaGeneration("Regenerate shot 1 using its saved prompt")).toBe(false)
  })
})
