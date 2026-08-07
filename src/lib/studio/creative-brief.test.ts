import { describe, expect, it } from "vitest"
import { creativeBriefCompletion, mergeCreativeBrief, nextCreativeBriefQuestion } from "./creative-brief"

describe("conversational creative brief", () => {
  it("asks only the next unconfirmed useful question", () => {
    const brief = mergeCreativeBrief({}, { objective: "Drive trials" }, ["objective"])
    expect(nextCreativeBriefQuestion(brief)).toMatchObject({ field: "audience" })
  })

  it("preserves earlier answers while confirming new decisions", () => {
    const first = mergeCreativeBrief({}, { objective: "Launch a product" }, ["objective"])
    const second = mergeCreativeBrief(first, { audience: "Busy parents" }, ["audience"])
    expect(second.objective).toBe("Launch a product")
    expect(second.confirmedFields).toEqual(["objective", "audience"])
  })

  it("allows skipped answers to remain editable without marking them confirmed", () => {
    const brief = mergeCreativeBrief({}, { platform: "Instagram" })
    expect(brief.platform).toBe("Instagram")
    expect(brief.confirmedFields).not.toContain("platform")
    expect(creativeBriefCompletion(brief)).toBe(0)
  })
})
