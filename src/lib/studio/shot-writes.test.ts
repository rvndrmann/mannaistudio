import { describe, expect, it } from "vitest"
import { assertShotPromptShape, normalizeShotColumns } from "./shot-writes"

describe("both doors write a shot the same way", () => {
  it("strips the identity block from an image prompt", () => {
    const columns = normalizeShotColumns(
      {
        prompt: [
          "CHARACTER LOCK:",
          "@Ethan — Young adult man, tall, close-cropped dark hair, a scar across his left cheek, grey jacket.",
          "🌍 SETTING",
          "He turns from the mirror.",
        ].join("\n"),
      },
      undefined,
    )
    // The look is the reference art's to define; the mention survives so the
    // cast still resolves.
    expect(columns.prompt).not.toContain("scar across his left cheek")
    expect(columns.prompt).toContain("@Ethan")
    expect(columns.prompt).toContain("turns from the mirror")
  })

  it("leaves a character named mid-sentence alone", () => {
    const columns = normalizeShotColumns({ prompt: "@Ethan leans on the sink as the mirror fogs." }, undefined)
    expect(columns.prompt).toBe("@Ethan leans on the sink as the mirror fogs.")
  })

  it("folds a video prompt into metadata without dropping what is already there", () => {
    const columns = normalizeShotColumns(
      { video_prompt: "0-4s — @Ethan turns from the mirror." },
      { cast_curated: true },
    )
    expect(columns.metadata).toMatchObject({ cast_curated: true })
    expect((columns.metadata as { video_prompt: string }).video_prompt).toContain("turns from the mirror")
    expect(columns).not.toHaveProperty("video_prompt")
  })

  it("takes the runtime from the beats, unless the same patch sets one", () => {
    const derived = normalizeShotColumns({ video_prompt: "0-2s — setup\n2-6s — the turn" }, undefined)
    expect(derived.duration_seconds).toBe(6)

    const explicit = normalizeShotColumns(
      { video_prompt: "0-2s — setup\n2-6s — the turn", duration_seconds: 10 },
      undefined,
    )
    expect(explicit.duration_seconds).toBe(10)
  })

  it("leaves a patch that touches neither prompt alone", () => {
    const columns = normalizeShotColumns({ title: "The mirror", aspect_ratio: "16:9" }, undefined)
    expect(columns).toEqual({ title: "The mirror", aspect_ratio: "16:9" })
  })

  it("rejects a master prompt's section headings written into one frame", () => {
    const scene = [
      "🌍 SETTING & ATMOSPHERE",
      "A cramped bathroom at night.",
      "CONSISTENCY RULES",
      "Keep the mirror fogged throughout.",
    ].join("\n")
    expect(() => assertShotPromptShape({ prompt: scene })).toThrow(/one frame/i)
  })

  it("rejects a timeline of beats written into one frame", () => {
    const timeline = "0-2s — he leans on the sink\n2-6s — the mirror fogs and clears"
    expect(() => assertShotPromptShape({ prompt: timeline })).toThrow(/single instant/i)
  })

  it("accepts one frame", () => {
    expect(() => assertShotPromptShape({ prompt: "@Ethan leans on the sink, lit from below by the mirror light." })).not.toThrow()
  })
})
