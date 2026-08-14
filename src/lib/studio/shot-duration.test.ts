import { describe, expect, it } from "vitest"
import { estimateShotSeconds, MAX_SHOT_SECONDS, MIN_SHOT_SECONDS, resolveShotSeconds, spokenWordCount } from "./shot-duration"

/**
 * Every shot was created at four seconds and rendered at four seconds however
 * much happened in it, so a long line was clipped mid-sentence and a wordless
 * reaction held for twice as long as it earned.
 */

const line = (words: number) => `@Ethan says: {"${Array.from({ length: words }, () => "word").join(" ")}"}`

describe("spokenWordCount", () => {
  it("reads the explicit dialogue braces", () => {
    expect(spokenWordCount('@Lena says: {"You were never going to tell me."}')).toBe(7)
  })

  it("falls back to the quotes storyboard prompts actually use", () => {
    expect(spokenWordCount("he demands 'How did you get in here?'")).toBe(6)
  })

  it("does not count the same line twice when both forms appear", () => {
    expect(spokenWordCount(`{"Wait. Stop."} and prose saying 'Wait. Stop.'`)).toBe(2)
  })

  it("counts nothing in a shot with no dialogue", () => {
    expect(spokenWordCount("16:9 macro close-up on trembling fingers gripping the red thread.")).toBe(0)
  })
})

describe("estimateShotSeconds", () => {
  it("keeps a wordless shot at the floor rather than padding it", () => {
    expect(estimateShotSeconds("A slow push-in on the bathroom door.")).toBe(MIN_SHOT_SECONDS)
  })

  it("gives a long line the time it takes to say", () => {
    // 30 words at three a second is ten seconds of speech, plus room to breathe.
    expect(estimateShotSeconds(line(30))).toBeGreaterThanOrEqual(11)
  })

  it("never runs one shot past the point where the scene wants a cut", () => {
    expect(estimateShotSeconds(line(400))).toBe(MAX_SHOT_SECONDS)
  })

  it("rounds up to a length the model renders, because rounding down clips the last word", () => {
    const seconds = estimateShotSeconds(line(20))
    expect([8, 10, 12, 15]).toContain(seconds)
    expect(seconds).toBeGreaterThanOrEqual(20 / 3)
  })

  it("stays inside what the chosen model can render", () => {
    expect(estimateShotSeconds(line(400), "bytedance/seedance-2.0/image-to-video")).toBeLessThanOrEqual(15)
  })
})

describe("resolveShotSeconds", () => {
  it("uses a duration the user set by hand exactly as it stands", () => {
    expect(resolveShotSeconds({ duration_seconds: 10, prompt: "silent shot" })).toBe(10)
  })

  it("sizes a shot still sitting on the untouched default from its own content", () => {
    expect(resolveShotSeconds({ duration_seconds: 4, prompt: line(30) })).toBeGreaterThan(4)
    expect(resolveShotSeconds({ duration_seconds: 4, prompt: "a silent look" })).toBe(MIN_SHOT_SECONDS)
  })

  it("holds even a hand-set duration to what one shot should run", () => {
    expect(resolveShotSeconds({ duration_seconds: 40, prompt: "" })).toBe(MAX_SHOT_SECONDS)
  })
})
