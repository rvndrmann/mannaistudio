import { describe, expect, it } from "vitest"
import { findContinuityConflicts } from "./continuity"
import { entityHandle, legacyEntityType, seriesBibleSchema } from "./story"

describe("story hierarchy domain", () => {
  it("creates a complete editable series bible from minimal input", () => {
    const bible = seriesBibleSchema.parse({ premise: "A roommate comedy" })
    expect(bible.format.aspectRatio).toBe("9:16")
    expect(bible.worldRules).toEqual([])
  })

  it("maps new entity kinds onto the compatible legacy enum", () => {
    expect(legacyEntityType("location")).toBe("scene")
    expect(legacyEntityType("product")).toBe("prop")
    expect(entityHandle("Cate's Apartment")).toBe("cate-s-apartment")
  })
})

describe("continuity inspection", () => {
  it("reports conflicting approved facts for the same entity", () => {
    const conflicts = findContinuityConflicts([
      { entityId: null, scope: "project", scopeId: null, category: "product_label", key: "front-label", value: "BLUE", locked: true },
      { entityId: null, scope: "shot", scopeId: null, category: "product_label", key: "front-label", value: "GREEN", locked: false },
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].severity).toBe("blocking")
  })

  it("does not claim continuity trouble when facts agree", () => {
    expect(findContinuityConflicts([
      { entityId: null, scope: "project", scopeId: null, category: "wardrobe", key: "coat", value: "red", locked: true },
      { entityId: null, scope: "episode", scopeId: null, category: "wardrobe", key: "coat", value: "red", locked: false },
    ])).toEqual([])
  })
})
