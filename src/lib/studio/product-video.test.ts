import { describe, expect, it } from "vitest"
import { normalizeProductProfile, productArtDirective, productPlacementLine, productVideoInstructions, readProductProfile, readProductVideo } from "./product-video"
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
  const shoe = { category: "running shoe", description: "White knit upper, orange sole.", placement: "worn", where: "on both feet", howToShow: "The person wears the shoes on both feet, laced, soles on the ground.", avoid: "never carried in a hand" }
  it("turns a reading of the product into one stored placement", () => {
    const profile = normalizeProductProfile(shoe, "user/p/shoe.png", "2026-10-12T00:00:00.000Z")
    expect(profile).toMatchObject({ placement: "worn", where: "on both feet", source: "user/p/shoe.png" })
    expect(normalizeProductProfile({ ...shoe, placement: "juggled" }, "user/p/shoe.png")).toBeNull()
    expect(normalizeProductProfile({ ...shoe, howToShow: "" }, "user/p/shoe.png")).toBeNull()
    // A replaced image is a different product until it has been read again.
    expect(readProductProfile({ product_profile: profile }, "user/p/shoe.png")).toEqual(profile)
    expect(readProductProfile({ product_profile: profile }, "user/p/other.png")).toBeNull()
    expect(readProductProfile({}, "user/p/shoe.png")).toBeNull()
  })
  it("tells every stage where a worn product goes instead of leaving it to be guessed", () => {
    const settings = { enabled: true, entityId: "product", interaction: "automatic" as const }
    const product = { name: "Runner", profile: normalizeProductProfile(shoe, "user/p/shoe.png") }
    const brief = productVideoInstructions(settings, product)
    expect(brief).toContain("running shoe")
    expect(brief).toContain("@Runner (running shoe) is worn on both feet")
    expect(brief).toContain("For every scene")
    const art = productArtDirective(settings, product)
    expect(art).toContain("worn on both feet")
    // The image model is given the one placement, not a list to choose from.
    expect(art).not.toMatch(/holding|held/i)
    expect(productArtDirective({ ...settings, enabled: false }, product)).toBe("")
  })
  it("lets the user's own choice override the reading, and still works without one", () => {
    const product = { name: "Runner", profile: normalizeProductProfile(shoe, "user/p/shoe.png") }
    expect(productPlacementLine({ enabled: true, entityId: "product", interaction: "hold" }, product)).toBe("@Runner (running shoe) is held naturally in the hand.")
    expect(productPlacementLine({ enabled: true, entityId: "product", interaction: "wear" }, product)).toContain("worn on both feet")
    expect(productPlacementLine({ enabled: true, entityId: "product", interaction: "automatic" }, null)).toContain("footwear on the feet")
  })
})
