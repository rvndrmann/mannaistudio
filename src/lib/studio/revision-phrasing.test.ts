import { describe, expect, it } from "vitest"
import { describesLookChange, describesReplacementState } from "./revision-phrasing"

describe("describesReplacementState", () => {
  it.each([
    "Make every location a rainy New York morning instead of neon night.",
    "Make the shot 2 video a rainy morning rather than neon night",
    "Change the café to a rooftop",
    "Turn the neon street into a wet morning street",
    "Replace the leather jacket with a raincoat",
    "The bracelet is no longer gold",
    "Switch the whole look to daylight",
  ])("reads %s as a change to something that already exists", (message) => {
    expect(describesReplacementState(message)).toBe(true)
  })

  it.each([
    // Every one of these must keep reaching a fast path: a guard that swallows
    // plain generation is worse than the bug it was added for.
    "Generate reference images for all characters",
    "Create turnarounds for every character",
    "regenerate all",
    "Generate the storyboard keyframe image for shot 2 from its saved prompt, using the reference art that shot already links to.",
    "Generate the video for shot 1 from its approved keyframe and saved prompt, carrying continuity from the previous shot's clip.",
    "Generate images for all shots",
    "Regenerate the reference art for Maya, Arjun from their current saved descriptions. Do not change the descriptions; use them exactly as saved.",
  ])("leaves %s on the generation path", (message) => {
    expect(describesReplacementState(message)).toBe(false)
  })
})

describe("describesLookChange", () => {
  it("counts a bare rewrite, which the replacement patterns deliberately do not", () => {
    // The cleanup fast path is named after this verb — "rewrite the prompts and
    // drop the character descriptions" is an ordinary request to it, so the
    // narrower predicate must not claim it.
    expect(describesLookChange("Rewrite the shot prompts")).toBe(true)
    expect(describesReplacementState("Rewrite the shot prompts")).toBe(false)
  })
})
