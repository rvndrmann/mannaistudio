import { describe, expect, it } from "vitest"
import { characterSheetPrompt, CHARACTER_SHEET_ASPECT_RATIO } from "./character-sheet"

describe("the character sheet prompt", () => {
  it("names the character it was given", () => {
    const prompt = characterSheetPrompt("KABIR SINGHANIA, 21-year-old Indian college student, 1989")
    expect(prompt).toContain("KABIR SINGHANIA, 21-year-old Indian college student, 1989")
    expect(prompt).toContain("SECTION 1 (Left)")
    expect(prompt).toContain("SECTION 2 (Top Right)")
    expect(prompt).toContain("SECTION 3 (Bottom)")
  })

  it("falls back to the attached picture when the asset has no description", () => {
    // An asset created from an uploaded photo often carries no text at all.
    // Leaving the placeholder empty asks the model to draw a sheet "of ,",
    // which it answers with a stranger.
    expect(characterSheetPrompt("   ")).toContain("of the character in the reference image")
  })

  it("renders wide, because the sheet is a grid", () => {
    expect(CHARACTER_SHEET_ASPECT_RATIO).toBe("16:9")
  })
})
