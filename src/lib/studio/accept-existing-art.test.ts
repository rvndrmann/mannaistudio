import { describe, expect, it } from "vitest"
import { metadataAcceptingEntityArt, metadataAcceptingKeyframe } from "./accept-existing-art"
import { artIsStale, keyframeIsStale } from "./project-state-summary"

describe("accepting the art that is already there", () => {
  const revised = "Sleek modern luxury sedan, dark tinted metallic finish, aerodynamic profile."
  const madeFrom = { image_generation: { status: "completed", source_description: "A dark luxury car.", model: "gpt-image-2" } }

  it("settles a description that was reworded after the art was made", () => {
    expect(artIsStale(revised, madeFrom)).toBe(true)
    const accepted = metadataAcceptingEntityArt(madeFrom, revised)
    expect(artIsStale(revised, accepted)).toBe(false)
  })

  it("records that the art was accepted rather than rendered from this text", () => {
    const accepted = metadataAcceptingEntityArt(madeFrom, revised) as { image_generation: Record<string, unknown> }
    expect(accepted.image_generation.accepted_at).toEqual(expect.any(String))
    // What it was actually made with survives, so the history stays honest.
    expect(accepted.image_generation.model).toBe("gpt-image-2")
  })

  it("keeps the rest of the entity's metadata", () => {
    const accepted = metadataAcceptingEntityArt({ ...madeFrom, cast_curated: true }, revised)
    expect(accepted).toMatchObject({ cast_curated: true })
  })

  it("goes stale again if the description changes after being accepted", () => {
    const accepted = metadataAcceptingEntityArt(madeFrom, revised)
    expect(artIsStale("A bright red convertible instead.", accepted)).toBe(true)
  })

  it("settles a keyframe whose shot prompt was edited", () => {
    const shotMetadata = { image_generation: { prompt: "Wide shot of the car." } }
    const current = "Low-angle shot of the car pulling away."
    expect(keyframeIsStale(current, shotMetadata)).toBe(true)
    expect(keyframeIsStale(current, metadataAcceptingKeyframe(shotMetadata, current))).toBe(false)
  })

  it("works on an entity with no provenance recorded at all", () => {
    const accepted = metadataAcceptingEntityArt(null, revised)
    expect(artIsStale(revised, accepted)).toBe(false)
  })
})
