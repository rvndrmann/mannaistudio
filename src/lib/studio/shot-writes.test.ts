import { findShotCastEntityIds } from "./entity-mentions"
import { directorTools } from "./tool-registry"
import { readShotVideoPrompt, videoPromptFor } from "./shot-video-prompt"
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

describe("a storyboard shot leaves create_storyboard_batch ready to film", () => {
  const shot = (extra: Record<string, unknown> = {}) => ({
    title: "Shot 1 — Hook",
    prompt: "Eye-level tracking shot of @Sara driving the @Sleek Luxury Car down a sunny street.",
    ...extra,
  })

  it("accepts a video prompt written beside the image prompt", () => {
    const parsed = directorTools.create_storyboard_batch.input.parse({
      episodeId: "11111111-1111-4111-8111-111111111111",
      shots: [shot({ videoPrompt: "0-3s: @Sara grips the wheel.\n3-5s: @Sara glances toward the camera." })],
    }) as unknown as { shots: Array<{ videoPrompt?: string }> }
    expect(parsed.shots[0].videoPrompt).toContain("0-3s")
  })

  it("refuses a shot with no video prompt", () => {
    // Without beats a shot is sized from its spoken words alone, so a wordless
    // one falls to the four-second floor however much happens in it — which is
    // how a whole storyboard came out at an identical 4s.
    expect(() => directorTools.create_storyboard_batch.input.parse({
      episodeId: "11111111-1111-4111-8111-111111111111",
      shots: [shot()],
    })).toThrow()
  })
})

describe("a video generation is filmed from the video prompt, not the frame", () => {
  it("prefers the saved video prompt over the image paragraph", () => {
    // The regression this encodes: submit_generation selected only `prompt`, so
    // a video with no model-supplied text was filmed from a single-frame
    // description and came back as a still that drifts.
    const shot = { prompt: "A frame.", metadata: { video_prompt: "0-4s: @Sara turns." } }
    expect(readShotVideoPrompt(shot)).toBe("0-4s: @Sara turns.")
    expect(videoPromptFor(shot)).toBe("0-4s: @Sara turns.")
  })

  it("falls back to the image prompt only when no video prompt was ever written", () => {
    expect(videoPromptFor({ prompt: "A frame." })).toBe("A frame.")
  })
})

/**
 * The revision path is the one that has to hold.
 *
 * "Change this prompt" is the most common thing a user asks for, and update_shot
 * plus the storyboard editor were the two writers that never checked the video
 * prompt's beats. A rewrite could quietly replace timed beats with a paragraph,
 * and the shot went back to filming as a drifting still.
 */
describe("a rewritten video prompt is held to the same shape as a written one", () => {
  const beats = "0-3s: @Sara grips the wheel.\n3-5s: @Sara glances toward the camera."

  it("accepts contiguous beats", () => {
    expect(() => assertShotPromptShape({ video_prompt: beats })).not.toThrow()
  })

  it("refuses a paragraph with no beats at all", () => {
    expect(() => assertShotPromptShape({
      video_prompt: "A smooth continuous tracking move follows the dark modern car along the sunny road.",
    })).toThrow(/no timed beats/i)
  })

  it("refuses beats with a hole in the middle", () => {
    expect(() => assertShotPromptShape({ video_prompt: "0-2s: a\n4-6s: b" })).toThrow(/nothing is scripted/i)
  })

  it("refuses beats that do not start at zero", () => {
    expect(() => assertShotPromptShape({ video_prompt: "2-6s: a" })).toThrow(/must start at 0/i)
  })

  it("lets the field be cleared, which falls back to the image prompt", () => {
    expect(() => assertShotPromptShape({ video_prompt: "" })).not.toThrow()
    expect(() => assertShotPromptShape({ video_prompt: "   " })).not.toThrow()
    expect(() => assertShotPromptShape({ video_prompt: null })).not.toThrow()
  })

  it("still checks the image prompt in the same patch", () => {
    expect(() => assertShotPromptShape({
      prompt: "PRODUCTION NOTES\nRuntime: 15 seconds",
      video_prompt: beats,
    })).toThrow()
  })

  it("keeps the beats' runtime when the patch does not set one", () => {
    const columns = normalizeShotColumns({ video_prompt: beats }, null) as { duration_seconds?: number }
    expect(columns.duration_seconds).toBe(5)
  })
})

/**
 * One guessed id used to cost eleven shots.
 *
 * create_storyboard_batch threw "One or more storyboard entity references are
 * invalid" when any referencedEntityId did not resolve — naming none of them,
 * so the Director could not tell which to fix and proposed the same batch
 * again. The ids are only a hint: the stored cast comes from the @mentions in
 * each shot's prompt, and falls back to this list only when the prompt names
 * nobody. So an unresolved id is dropped and reported.
 */
describe("a storyboard batch survives an entity id the model guessed", () => {
  const real = "11111111-1111-4111-8111-111111111111"
  const guessed = "99999999-9999-4999-8999-999999999999"

  it("accepts a batch whose referencedEntityIds include an unknown one", () => {
    const parsed = directorTools.create_storyboard_batch.input.parse({
      episodeId: "22222222-2222-4222-8222-222222222222",
      shots: [{
        title: "Shot 1",
        prompt: "@Sara at the wheel.",
        videoPrompt: "0-4s: @Sara turns toward the camera.",
        referencedEntityIds: [real, guessed],
      }],
    }) as unknown as { shots: Array<{ referencedEntityIds: string[] }> }
    // The schema does not judge which ids exist; execute drops the ones that
    // do not, rather than refusing the batch.
    expect(parsed.shots[0].referencedEntityIds).toEqual([real, guessed])
  })

  it("keeps the cast the prompt names regardless of the id list", () => {
    const entities = [{ id: real, name: "Sara", type: "character" as const, reference_images: ["a.png"] }]
    expect(findShotCastEntityIds("@Sara at the wheel.", entities, [guessed])).toEqual([real])
  })
})
