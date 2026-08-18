import { describe, expect, it } from "vitest"
import { forbidsImageGeneration, forbidsMediaGeneration, forbidsVideoGeneration, requestsWrittenStory } from "./media-intent"

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

describe("requests for written work", () => {
  it.each([
    "i want to create product ad for my coffee brand, write some funny storyline and 30 second video and placing the product in the end",
    "write me a script for a 30 second ad",
    "draft the concept before we shoot anything",
    "come up with a story for this episode",
    "rewrite the dialogue in scene two",
  ])("reads %s as writing rather than rendering", (message) => {
    expect(requestsWrittenStory(message)).toBe(true)
  })

  it.each([
    "generate the video for shot 3",
    "make the video from the saved script",
    "render shot 1 and shot 2",
    // A named shot is about footage that exists, even alongside a writing verb.
    "rewrite the prompt and generate the video for shot 4",
  ])("leaves %s on the generation path", (message) => {
    expect(requestsWrittenStory(message)).toBe(false)
  })
})
