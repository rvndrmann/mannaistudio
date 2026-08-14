import { describe, expect, it } from "vitest"
import { aspectMismatch, restateAspect } from "./shot-aspect"

/**
 * A prompt opens by stating its framing, and the shot carries the same framing
 * as a setting. Change the project's aspect mid-production and the setting
 * moves while the sentence does not — every shot then tells two different
 * stories about its own composition, and the render carries both.
 */

describe("aspectMismatch", () => {
  it("catches a prompt that states the aspect the shot no longer has", () => {
    expect(aspectMismatch({ id: "1", prompt: "16:9 cinematic medium shot of @Ethan.", aspect_ratio: "9:16" })).toBe(true)
  })

  it("passes a prompt that already agrees with its shot", () => {
    expect(aspectMismatch({ id: "1", prompt: "9:16 cinematic medium shot of @Ethan.", aspect_ratio: "9:16" })).toBe(false)
  })

  it("passes a prompt that states no aspect at all", () => {
    expect(aspectMismatch({ id: "1", prompt: "A slow push-in on the door.", aspect_ratio: "9:16" })).toBe(false)
  })

  it("does not read an unrelated number pair as an aspect", () => {
    expect(aspectMismatch({ id: "1", prompt: "@Ethan says: {\"It's been 3:47 since she left.\"}", aspect_ratio: "9:16" })).toBe(false)
  })

  it("leaves an aspect it does not recognise alone rather than guessing", () => {
    expect(aspectMismatch({ id: "1", prompt: "16:9 shot", aspect_ratio: "custom" })).toBe(false)
  })
})

describe("restateAspect", () => {
  it("replaces the stated aspect and nothing else", () => {
    const prompt = "16:9 cinematic medium shot. @Lena stands behind @Ethan in the hallway."
    expect(restateAspect(prompt, "9:16")).toBe("9:16 cinematic medium shot. @Lena stands behind @Ethan in the hallway.")
  })

  it("corrects every occurrence in a prompt that repeats it", () => {
    const prompt = "16:9 wide shot. Required composition: 16:9."
    expect(restateAspect(prompt, "9:16")).toBe("9:16 wide shot. Required composition: 9:16.")
  })

  it("leaves an unrecognised target aspect untouched", () => {
    const prompt = "16:9 wide shot."
    expect(restateAspect(prompt, "ultra-wide")).toBe(prompt)
  })

  it("never touches a number pair that only looks like an aspect", () => {
    const prompt = "@Ethan says: {\"It's 3:47.\"}"
    expect(restateAspect(prompt, "9:16")).toBe(prompt)
  })
})
