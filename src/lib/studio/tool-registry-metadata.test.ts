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
