import { describe, expect, it } from "vitest"
import { normalizeEntityColumns } from "./entity-writes"
import { artIsStale } from "./project-state-summary"

const provenance = { image_generation: { status: "completed", source_description: "Courier in her late twenties with short red hair." } }

describe("both doors write a character the same way", () => {
  it("keeps the record of what the art was made from when a look changes", () => {
    const columns = normalizeEntityColumns(
      { description: "Courier in her late twenties with cropped black hair.", metadata: { cast_note: "hero" } },
      provenance,
    )
    expect(columns.metadata).toMatchObject(provenance)
    expect(columns.metadata).toMatchObject({ cast_note: "hero" })
  })

  it("so the changed look still reads as stale art", () => {
    const columns = normalizeEntityColumns(
      { description: "Courier in her late twenties with cropped black hair.", metadata: {} },
      provenance,
    )
    // The regression this exists to prevent: erase the provenance and the
    // pipeline calls the old red-haired reference art clean.
    expect(artIsStale("Courier in her late twenties with cropped black hair.", columns.metadata)).toBe(true)
  })

  it("leaves metadata alone when the patch does not mention it", () => {
    const columns = normalizeEntityColumns({ name: "Sara" }, provenance)
    expect(columns).not.toHaveProperty("metadata")
  })

  it("does not let an empty or missing object erase what is stored", () => {
    expect(normalizeEntityColumns({ metadata: {} }, provenance).metadata).toMatchObject(provenance)
    expect(normalizeEntityColumns({ metadata: null }, provenance)).not.toHaveProperty("metadata")
    expect(normalizeEntityColumns({ metadata: "nonsense" }, provenance)).not.toHaveProperty("metadata")
  })

  it("still lets a patch overwrite the keys it names", () => {
    const columns = normalizeEntityColumns(
      { metadata: { image_generation: { status: "failed" } } },
      provenance,
    )
    expect(columns.metadata).toMatchObject({ image_generation: { status: "failed" } })
  })
})
