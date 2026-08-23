import { describe, expect, it } from "vitest"
import { estimateShotSeconds, MAX_SHOT_SECONDS, MIN_SHOT_SECONDS, resolveShotSeconds, spokenWordCount, scriptRangeSeconds } from "./shot-duration"

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

/**
 * Why every shot came out at four seconds.
 *
 * The estimate counted spoken words and nothing else, so a shot with no
 * dialogue — an aerial tracking move, a reveal, a trunk slam — produced
 * `needed = 0` and fell to the floor. A whole storyboard of wordless shots was
 * therefore identical at 4s, whatever happened in them, while the script that
 * produced it had already timed each beat.
 */
describe("a wordless shot is as long as the script says", () => {
  it("reads a timed range out of the script text", () => {
    expect(scriptRangeSeconds("### 00:00–00:05 — HOOK")).toBe(5)
    expect(scriptRangeSeconds("00:11-00:17 Trunk POV")).toBe(6)
    expect(scriptRangeSeconds("1:00 — 1:15 long take")).toBe(15)
  })

  it("ignores text with no range in it", () => {
    expect(scriptRangeSeconds("EXT. MOVING CAR — DAY")).toBeNull()
    expect(scriptRangeSeconds("")).toBeNull()
  })

  it("ignores a range that runs backwards or nowhere", () => {
    expect(scriptRangeSeconds("00:05–00:05")).toBeNull()
    expect(scriptRangeSeconds("00:09–00:04")).toBeNull()
  })

  it("sizes a silent action shot from its scripted beat, not the floor", () => {
    const shot = "Wide low aerial tracking view of @Luxury Car speeding along a clean roadway."
    expect(estimateShotSeconds(shot)).toBe(MIN_SHOT_SECONDS)
    expect(estimateShotSeconds(`${shot}\n### 00:00–00:11 — HOOK`)).toBe(12)
  })

  it("still lets dialogue win when the line needs longer than the beat", () => {
    // Eighteen words at three a second, plus a second of room, is seven.
    const line = `{"${"word ".repeat(18).trim()}"}`
    expect(estimateShotSeconds(`${line}\n00:00–00:05`)).toBe(8)
  })

  it("uses the stored script text when resolving a saved shot", () => {
    expect(resolveShotSeconds({ duration_seconds: 4, prompt: "Aerial tracking.", script_text: "00:00–00:10" })).toBe(10)
  })

  it("leaves a duration the user set by hand alone", () => {
    expect(resolveShotSeconds({ duration_seconds: 6, prompt: "x", script_text: "00:00–00:15" })).toBe(6)
  })
})

describe("dialogue is counted in the form the workspace actually stores it", () => {
  it("counts a line saved as plain braces, which is what script_text holds", () => {
    // The stored form on a real shot. Matching only {"..."} counted this as
    // silence, so a shot with a spoken line was sized as though it had none.
    expect(spokenWordCount("{Still paying middle men every time you generate?}")).toBe(8)
  })

  it("still counts the Prompt Agent's quoted form", () => {
    expect(spokenWordCount('@Sara says: {"You pay the model directly."}')).toBe(5)
  })

  it("gives a long line the room to be said", () => {
    const line = `{${"word ".repeat(30).trim()}}`
    expect(estimateShotSeconds(line)).toBe(12)
  })

  it("counts nothing in a prompt with no line at all", () => {
    expect(spokenWordCount("Wide aerial tracking of the car.")).toBe(0)
  })
})
