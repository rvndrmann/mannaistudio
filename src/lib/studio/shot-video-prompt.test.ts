import { describe, expect, it } from "vitest"
import { beatRuntimeSeconds, describeBeatProblems, parseShotBeats, readShotVideoPrompt, videoPromptFor, writeShotVideoPrompt } from "./shot-video-prompt"

/**
 * A shot's `prompt` is one paragraph written for the image model — it describes
 * a frame. Filming from it is what made clips read as a drifting still, and
 * putting beats into it instead would have wrecked the keyframe that shares the
 * field. So the video prompt lives beside the image one.
 */

const beats = `0-4s: @Ethan turns from the mirror. <Tap drips>\n4-8s: @Lena steps into frame. @Lena says: {"You invited me."}`

describe("storing the video prompt beside the image prompt", () => {
  it("keeps the image prompt untouched and falls back to it until beats are written", () => {
    const shot = { prompt: "16:9 close-up of @Ethan at the mirror.", metadata: {} }
    expect(readShotVideoPrompt(shot)).toBe("")
    expect(videoPromptFor(shot)).toBe("16:9 close-up of @Ethan at the mirror.")
  })

  it("films from the video prompt once there is one", () => {
    const shot = { prompt: "a still frame", metadata: { video_prompt: beats } }
    expect(videoPromptFor(shot)).toBe(beats)
  })

  it("writes alongside whatever else the shot keeps in metadata", () => {
    expect(writeShotVideoPrompt({ cast_curated: true }, beats)).toEqual({ cast_curated: true, video_prompt: beats })
  })

  it("clears the video prompt without disturbing the rest", () => {
    expect(writeShotVideoPrompt({ cast_curated: true, video_prompt: beats }, "   ")).toEqual({ cast_curated: true })
  })

  it("survives a shot whose metadata is missing or malformed", () => {
    expect(writeShotVideoPrompt(null, beats)).toEqual({ video_prompt: beats })
    expect(readShotVideoPrompt({ metadata: "not an object" })).toBe("")
  })
})

describe("beats as the runtime", () => {
  it("reads the blocks", () => {
    expect(parseShotBeats(beats)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }])
  })

  it("takes the runtime from where the last beat ends", () => {
    expect(beatRuntimeSeconds(beats)).toBe(8)
  })

  it("has no runtime to offer for a prompt with no beats", () => {
    expect(beatRuntimeSeconds("A paragraph describing a frame.")).toBeNull()
  })

  it("never returns a runtime past what one shot renders", () => {
    expect(beatRuntimeSeconds("0-40s: a very long take")).toBe(15)
  })
})

describe("describeBeatProblems", () => {
  it("passes contiguous beats", () => {
    expect(describeBeatProblems(beats)).toEqual([])
  })

  it("names a gap in the seconds", () => {
    expect(describeBeatProblems("0-4s: a\n6-8s: b").join(" ")).toContain("Nothing is scripted between 4s and 6s")
  })

  it("names an overlap", () => {
    expect(describeBeatProblems("0-5s: a\n4-8s: b").join(" ")).toContain("overlap")
  })

  it("insists the first beat starts at zero", () => {
    expect(describeBeatProblems("2-6s: a").join(" ")).toContain("must start at 0")
  })

  it("says a scene running past one shot wants another cut", () => {
    expect(describeBeatProblems("0-20s: a").join(" ")).toContain("wants another cut")
  })

  it("rejects a prompt with no beats at all", () => {
    expect(describeBeatProblems("One paragraph for the image model.").join(" ")).toContain("No timed beats found")
  })
})

describe("revising rather than replacing", () => {
  // A user who dislikes part of a prompt wants that part changed, not the whole
  // thing rewritten — so the current text has to be readable before it is
  // edited, and editing one prompt must never disturb the other.
  it("keeps the image prompt when the video prompt is rewritten", () => {
    const shot = { prompt: "16:9 close-up of @Ethan.", metadata: writeShotVideoPrompt({}, beats) }
    const revised = { ...shot, metadata: writeShotVideoPrompt(shot.metadata, "0-6s: something else entirely") }
    expect(revised.prompt).toBe("16:9 close-up of @Ethan.")
    expect(readShotVideoPrompt(revised)).toBe("0-6s: something else entirely")
  })

  it("hands back the existing text so it can be edited instead of re-guessed", () => {
    expect(readShotVideoPrompt({ metadata: writeShotVideoPrompt({}, beats) })).toBe(beats)
  })
})

describe("the timestamped-title beat form", () => {
  // The saved Seedance instruction writes beats as `⏱️ 0–2s — TITLE`: em dash,
  // no colon. A pattern that insisted on `0-4s:` rejected the format this
  // workspace's own Prompt Agent was written to produce.
  const seedance = `⏱️ 0–2s — URBAN SETUP
Wide cinematic shot of the bathroom threshold.

⏱️ 2–4s — CHAOS IGNITES
@Ethan spins around abruptly. <Tap drips>`

  it("reads beats written the way the Prompt Agent writes them", () => {
    expect(parseShotBeats(seedance)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }])
    expect(describeBeatProblems(seedance)).toEqual([])
  })

  it("takes the runtime from the last beat in either form", () => {
    expect(beatRuntimeSeconds(seedance)).toBe(4)
    expect(beatRuntimeSeconds("0-4s: a\n4-8s: b")).toBe(8)
  })

  it("reads the half-second beats the instruction's own example uses", () => {
    expect(parseShotBeats("⏱️ 4–5.5s — VILLAIN ATTACK\n⏱️ 5.5–7s — FULL PANIC"))
      .toEqual([{ start: 4, end: 5.5 }, { start: 5.5, end: 7 }])
  })
})
