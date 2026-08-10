import { describe, expect, it } from "vitest"
import { buildEntityReferenceImagePrompt, parseBulkEntityImageIntent, projectVisualStyle, visualStyleDirective } from "./entity-image-workflow"

describe("entity image workflow", () => {
  it("routes all-character image requests to character entities", () => {
    expect(parseBulkEntityImageIntent("Create all the character image")).toEqual({ types: ["character"], regenerate: false })
  })

  it("routes asset requests to props and scenes", () => {
    expect(parseBulkEntityImageIntent("Generate all asset images")).toEqual({ types: ["prop", "scene"], regenerate: false })
  })

  it("turns photorealistic settings into a strict anti-cartoon directive", () => {
    const directive = visualStyleDirective("Realistic - Photorealistic")
    expect(directive).toContain("live-action photorealism")
    expect(directive).toContain("No anime")
    expect(directive).toContain("collage")
  })

  it("builds one text-free production reference prompt per entity", () => {
    const prompt = buildEntityReferenceImagePrompt({ id: "1", name: "Maya", type: "character", description: "Lead driver in her late twenties" }, "Realistic - Photorealistic")
    expect(prompt).toContain("exactly one character")
    expect(prompt).toContain("Maya")
    expect(prompt).toContain("Do not add names")
  })

  it("reads the persisted project style used by generation routes", () => {
    expect(projectVisualStyle({ default_style: "Realistic - Photorealistic", metadata: { basic_settings: { visualStyle: "Anime - Ghibli" } } })).toBe("Realistic - Photorealistic")
    expect(projectVisualStyle({ metadata: { basic_settings: { visualStyle: "Anime - Ghibli" } } })).toBe("Anime - Ghibli")
  })
})
