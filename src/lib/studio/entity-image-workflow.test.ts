import { describe, expect, it } from "vitest"
import { buildEntityReferenceImagePrompt, parseBulkEntityImageIntent, projectVisualStyle, visualStyleDirective, describesLookChange } from "./entity-image-workflow"

describe("entity image workflow", () => {
  it("routes all-character image requests to character entities", () => {
    expect(parseBulkEntityImageIntent("Create all the character image")).toEqual({ types: ["character"], regenerate: false })
  })

  it("routes asset requests to props and scenes", () => {
    expect(parseBulkEntityImageIntent("Generate all asset images")).toEqual({ types: ["prop", "scene"], regenerate: false })
  })

  it("treats pending entities as the missing-reference set without touching characters", () => {
    expect(parseBulkEntityImageIntent("create pending scene and prop images")).toEqual({ types: ["prop", "scene"], regenerate: false })
  })

  it("accepts singular entity nouns", () => {
    expect(parseBulkEntityImageIntent("create character images")).toEqual({ types: ["character"], regenerate: false })
    expect(parseBulkEntityImageIntent("generate prop images")).toEqual({ types: ["prop"], regenerate: false })
  })

  it("keeps ignoring requests that are not bulk entity image work", () => {
    expect(parseBulkEntityImageIntent("generate an image for storyboard shot 2")).toBeNull()
    expect(parseBulkEntityImageIntent("what characters are pending?")).toBeNull()
  })

  // "create shot image again with better character consistency" names
  // "character", which routed a shot re-render to the entity-art path and
  // answered with "all characters already have reference images".
  it("leaves shot work alone even when the message mentions characters", () => {
    expect(parseBulkEntityImageIntent("create shot image again with better character consistency")).toBeNull()
    expect(parseBulkEntityImageIntent("regenerate the keyframe, keep the characters consistent")).toBeNull()
    expect(parseBulkEntityImageIntent("redo the storyboard characters look wrong")).toBeNull()
  })

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

describe("a look change is a revision, not a request for art", () => {
  it("lets the reported message reach the agent instead of answering about images", () => {
    // "Make every location a rainy New York morning instead of neon night."
    // matched "make" and "location", so it was answered with "they already
    // have reference images" and the look change never happened.
    expect(parseBulkEntityImageIntent("Make every location a rainy New York morning instead of neon night.")).toBeNull()
  })

  it("recognises the other ways a change gets worded", () => {
    for (const message of [
      "Change all the scenes to daylight.",
      "Turn the locations into a snowy street.",
      "Replace the neon look with overcast morning.",
      "The characters should no longer wear black.",
      "Switch every prop to matte packaging.",
      "Revise the locations to feel warmer.",
    ]) {
      expect(parseBulkEntityImageIntent(message), message).toBeNull()
    }
  })

  it("still routes a real request for art, however it is phrased", () => {
    expect(parseBulkEntityImageIntent("Generate reference images for all characters")).not.toBeNull()
    expect(parseBulkEntityImageIntent("Create turnarounds for every character")).not.toBeNull()
    expect(parseBulkEntityImageIntent("regenerate all")).not.toBeNull()
  })

  it("keeps an explicit ask for images even when it is worded as a contrast", () => {
    // Asking for art and naming what it replaces is still asking for art.
    expect(parseBulkEntityImageIntent("Regenerate the character images instead of the old ones")).not.toBeNull()
  })
})

describe("describesLookChange", () => {
  it("is quiet for a plain generation request", () => {
    expect(describesLookChange("Generate images for all characters")).toBe(false)
    expect(describesLookChange("Create the location plates")).toBe(false)
  })
})
