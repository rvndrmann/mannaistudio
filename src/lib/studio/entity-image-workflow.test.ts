import { describe, expect, it } from "vitest"
import { buildEntityReferenceImagePrompt, projectVisualStyle, visualStyleDirective } from "./entity-image-workflow"

// The routing assertions that used to live here went with parseBulkEntityImageIntent:
// they described which messages the fast path claimed, and the fast path is gone.
// What that layer was protecting is covered by director-routing.eval.ts, which
// asks the agent the same questions and checks the tool it reaches for.
describe("entity reference art prompts", () => {
  it("turns photorealistic settings into a strict anti-cartoon directive", () => {
    const directive = visualStyleDirective("Realistic - Photorealistic")
    expect(directive).toContain("live-action photorealism")
    expect(directive).toContain("No anime")
    expect(directive).toContain("collage")
  })

  it("renders a character as a three-section photorealistic reference sheet", () => {
    const prompt = buildEntityReferenceImagePrompt({ id: "1", name: "Maya", type: "character", description: "Lead driver in her late twenties" }, "Realistic - Photorealistic")
    expect(prompt).toContain("Maya")
    expect(prompt).toContain("character reference sheet")
    expect(prompt).toContain("SECTION 1 (Left)")
    expect(prompt).toContain("front view, side profile view, and back view")
    expect(prompt).toContain("SECTION 2 (Top Right)")
    expect(prompt).toContain("neutral, happy, angry, sad, and surprised")
    expect(prompt).toContain("SECTION 3 (Bottom)")
    expect(prompt).toContain("eye texture, hair texture, shoe details, fabric stitching, and accessories")
    expect(prompt).toContain("Clean white studio background")
    expect(prompt).toContain("8K detail")
    expect(prompt).toContain("Lead driver in her late twenties")
  })

  it("renders a location as an establishing plate with nobody in it", () => {
    const prompt = buildEntityReferenceImagePrompt({ id: "2", name: "Rainy Alley", type: "scene", description: "Wet brick alley at night" }, "Realistic - Photorealistic")
    expect(prompt).toContain("empty establishing plate")
    expect(prompt).toContain("no background people")
    // A plate is staged into later, so depth and a neutral camera matter as
    // much as emptiness, and a moment's props would date it to one shot.
    expect(prompt).toContain("Eye-level")
    expect(prompt).toContain("background clearly layered")
    expect(prompt).toContain("no story action")
    expect(prompt).not.toContain("reference sheet")
  })

  it("renders a prop alone on a plain background", () => {
    const prompt = buildEntityReferenceImagePrompt({ id: "3", name: "Brass Key", type: "prop", description: "Tarnished brass key" }, "Realistic - Photorealistic")
    expect(prompt).toContain("plain, uncluttered neutral background")
    expect(prompt).toContain("no hands holding it")
    expect(prompt).not.toContain("reference sheet")
  })

  it("keeps every reference prompt free of rendered text", () => {
    for (const type of ["character", "scene", "prop"] as const) {
      const prompt = buildEntityReferenceImagePrompt({ id: "4", name: "Subject", type, description: "" }, "Realistic - Photorealistic")
      expect(prompt).toContain("no names, ages, biographies, captions, callouts, borders, panels, watermarks, or any text inside the image")
    }
  })

  it("reads the persisted project style used by generation routes", () => {
    expect(projectVisualStyle({ default_style: "Realistic - Photorealistic", metadata: { basic_settings: { visualStyle: "Anime - Ghibli" } } })).toBe("Realistic - Photorealistic")
    expect(projectVisualStyle({ metadata: { basic_settings: { visualStyle: "Anime - Ghibli" } } })).toBe("Anime - Ghibli")
  })
})
