import { describe, expect, it } from "vitest"
import { normalizeScriptContent, scriptContentSchema } from "./script"

describe("scriptContentSchema & normalizeScriptContent", () => {
  it("validates and preserves canonical script objects", () => {
    const canonical = {
      title: "Coffee Ad 30s",
      overview: "A fast-paced comedy ad about morning coffee.",
      body: "00:00 - Ethan wakes up exhausted.\n00:10 - Smells the fresh roast.",
      scenes: [
        { heading: "INT. BEDROOM - MORNING", timing: "00:00-00:10", direction: "Ethan snoozes alarm", framing: "Close up", continuity: "Messy hair" }
      ]
    }

    const validated = scriptContentSchema.parse(canonical)
    const normalized = normalizeScriptContent(validated)

    expect(normalized.title).toBe("Coffee Ad 30s")
    expect(normalized.overview).toBe("A fast-paced comedy ad about morning coffee.")
    expect(normalized.body).toBe(canonical.body)
    expect(normalized.scenes).toHaveLength(1)
    expect(normalized.scenes[0].heading).toBe("INT. BEDROOM - MORNING")
  })

  it("normalizes near-miss shapes with beats and tagline", () => {
    const modelOutput = {
      title: "Morning Fuel",
      tagline: "Wake up to perfection",
      format: "30-second commercial",
      beats: [
        { time: "0-5s", beat: "The Struggle", action: "Character reaches for alarm, groaning.", dialogue: "Not again..." },
        { time: "5-15s", beat: "The Discovery", action: "Fresh steam rises from coffee pot.", dialogue: "Wait, what is that scent?" },
        { time: "15-30s", beat: "The Transformation", action: "Energetic smile taking a sip.", dialogue: "Now we're talking." },
      ]
    }

    const validated = scriptContentSchema.parse(modelOutput)
    const normalized = normalizeScriptContent(validated)

    expect(normalized.title).toBe("Morning Fuel")
    expect(normalized.overview).toBe("Wake up to perfection")
    expect(normalized.body).toContain("[0-5s] The Struggle")
    expect(normalized.body).toContain("Character reaches for alarm, groaning.")
    expect(normalized.body).toContain("Dialogue: Not again...")
    expect(normalized.body).toContain("[15-30s] The Transformation")
  })

  it("normalizes near-miss shapes with synopsis and screenplay", () => {
    const modelOutput = {
      name: "Cyberpunk Chase",
      synopsis: "A rogue courier evades drones across neon alleys.",
      screenplay: "EXT. NEON ALLEY - NIGHT\nRain pours as Kael sprints across slick pavement."
    }

    const validated = scriptContentSchema.parse(modelOutput)
    const normalized = normalizeScriptContent(validated)

    expect(normalized.title).toBe("Cyberpunk Chase")
    expect(normalized.overview).toBe("A rogue courier evades drones across neon alleys.")
    expect(normalized.body).toBe("EXT. NEON ALLEY - NIGHT\nRain pours as Kael sprints across slick pavement.")
  })

  it("synthesizes body from scenes when body is empty", () => {
    const inputWithScenesOnly = {
      title: "Scene Only Script",
      scenes: [
        { heading: "SCENE 1: THE LAB", timing: "0:00-0:15", framing: "Wide shot", direction: "Dr. Aris powers on the reactor.", continuity: "Safety goggles on" },
        { heading: "SCENE 2: THE REACTION", timing: "0:15-0:30", framing: "Close up", direction: "Sparks fly across the chamber.", continuity: "Blue glow" }
      ]
    }

    const normalized = normalizeScriptContent(inputWithScenesOnly)
    expect(normalized.title).toBe("Scene Only Script")
    expect(normalized.body).toContain("SCENE 1: THE LAB")
    expect(normalized.body).toContain("Timing: 0:00-0:15")
    expect(normalized.body).toContain("Action: Dr. Aris powers on the reactor.")
    expect(normalized.body).toContain("SCENE 2: THE REACTION")
  })

  it("handles raw string scripts and extracts title if present", () => {
    const rawText = `Title: Midnight Runner\n\nOverview: A thrilling night escape.\n\n00:00 - Car accelerates down the highway.\n00:15 - Police sirens echo.`
    const normalized = normalizeScriptContent(rawText)

    expect(normalized.title).toBe("Midnight Runner")
    expect(normalized.overview).toBe("A thrilling night escape.")
    expect(normalized.body).toBe(rawText)
  })

  it("handles null, undefined and empty strings gracefully", () => {
    expect(normalizeScriptContent(null)).toEqual({
      title: "Untitled production",
      overview: "",
      body: "",
      scenes: [],
    })
    expect(normalizeScriptContent("")).toEqual({
      title: "Untitled production",
      overview: "",
      body: "",
      scenes: [],
    })
  })
})
