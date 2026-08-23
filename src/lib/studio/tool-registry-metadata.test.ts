import { describe, expect, it } from "vitest"
import { mergeAssetMetadata } from "./tool-registry"
import { artIsStale } from "./project-state-summary"

describe("mergeAssetMetadata", () => {
  it("keeps the generation provenance an edit never mentioned", () => {
    // update_asset used to write patch.metadata straight into the column. A
    // look revision that recorded {time_of_day: "morning"} erased
    // image_generation, and with it the only record of which description the
    // art was made from.
    const existing = {
      role: "chase_location",
      image_generation: { source_description: "Neon-magenta night street", provider: "openai" },
    }
    const merged = mergeAssetMetadata(existing, { time_of_day: "morning", palette: "cool gray-blue" })
    expect(merged.image_generation).toEqual(existing.image_generation)
    expect(merged.time_of_day).toBe("morning")
    expect(merged.role).toBe("chase_location")
  })

  it("still lets the patch win on the keys it names", () => {
    expect(mergeAssetMetadata({ time_of_day: "night" }, { time_of_day: "morning" }).time_of_day).toBe("morning")
  })

  it("survives an entity that has no metadata yet", () => {
    expect(mergeAssetMetadata(null, { role: "hero" })).toEqual({ role: "hero" })
    expect(mergeAssetMetadata("not an object", { role: "hero" })).toEqual({ role: "hero" })
  })
})

describe("the stale-art check that the clobber disabled", () => {
  const artOf = (sourceDescription: string) => ({
    role: "chase_location",
    image_generation: { source_description: sourceDescription },
  })

  it("sees art made from a description that has since been rewritten", () => {
    const metadata = mergeAssetMetadata(artOf("Neon-magenta night street"), { time_of_day: "morning" })
    expect(artIsStale("Rainy New York morning urban street, cool gray-blue overcast daylight.", metadata)).toBe(true)
  })

  it("leaves art alone when the description has not changed", () => {
    const description = "Rainy New York morning urban street."
    const metadata = mergeAssetMetadata(artOf(description), { time_of_day: "morning" })
    expect(artIsStale(description, metadata)).toBe(false)
  })

  it("cannot judge art whose provenance was erased, which is the failure being prevented", () => {
    // Kept as a test because it documents why the merge matters: with the
    // provenance gone there is no way back to a stale verdict, and the
    // workspace reports revised assets as finished.
    expect(artIsStale("Rainy New York morning urban street.", { time_of_day: "morning" })).toBe(false)
  })
})

/**
 * Freshly generated art must not read as stale.
 *
 * source_description was only ever written by accept_existing_art, never where
 * the art is actually made. artIsStale then fell to its fallback — does the
 * description appear verbatim inside the generation prompt — which holds only
 * for the prompt this workspace composes. generate_entity_reference_art lets
 * the Director supply its own prompt, and when it does the description is
 * nowhere in the text, so the picture that had just finished rendering was
 * reported as out of date and the pipeline offered a costly regenerate.
 */
describe("art just generated is not immediately stale", () => {
  const description = "Courier in her late twenties, practical and alert, built for photorealistic production."

  const generatedWith = (prompt: string, sourceDescription?: string) => ({
    image_generation: {
      path: "entities/sara.png",
      generatedAt: new Date().toISOString(),
      prompt,
      ...(sourceDescription === undefined ? {} : { source_description: sourceDescription }),
    },
  })

  it("is fresh when the description it was made from is recorded", () => {
    // The Director's own wording, which never quotes the description.
    const modelWritten = "Studio reference sheet, three-quarter turnaround, neutral backdrop, 8K."
    expect(artIsStale(description, generatedWith(modelWritten, description))).toBe(false)
  })

  it("is stale once that description is rewritten", () => {
    const metadata = generatedWith("anything at all", description)
    expect(artIsStale("Courier in her forties with cropped grey hair.", metadata)).toBe(true)
  })

  it("without the record, a model-written prompt reads as stale — the old behaviour", () => {
    const modelWritten = "Studio reference sheet, three-quarter turnaround, neutral backdrop, 8K."
    expect(artIsStale(description, generatedWith(modelWritten))).toBe(true)
  })

  it("still falls back for art made before the description was recorded", () => {
    const composed = `Create a reference sheet.\nCanonical description: ${description}`
    expect(artIsStale(description, generatedWith(composed))).toBe(false)
  })
})
