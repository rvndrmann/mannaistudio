import { describe, expect, it } from "vitest"
import { readProductVideo, productVideoInstructions } from "./product-video"
describe("product video settings", () => {
  it("keeps existing projects off and normalizes malformed interactions", () => {
    expect(readProductVideo(null)).toEqual({ enabled: false, entityId: "", interaction: "automatic" })
    expect(readProductVideo({ basic_settings: { productVideo: { enabled: true, entityId: "product", interaction: "invent" } } }).interaction).toBe("automatic")
  })
  it("requires visual inspection before authoring and preserves the original product", () => {
    const instruction = productVideoInstructions({ enabled: true, entityId: "product", interaction: "wear" })
    expect(instruction).toContain("BEFORE")
    expect(instruction).toContain("Interaction: wear")
    expect(instruction).toContain("never generate a replacement product")
    expect(productVideoInstructions(readProductVideo(null))).toBe("")
  })
})
