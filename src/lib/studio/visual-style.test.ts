import { describe, expect, it } from "vitest"
import { composeImagePrompt } from "./image-prompt-composition"
import { buildEntityReferenceImagePrompt } from "./entity-image-workflow"
import { composeLookDirectives } from "./style-dna"
import { defaultDirectorTeam, teamForVisualStyle } from "./director-team"
import { describeJobFailure } from "./mcp/reporting"
import {
  asksForClaymation, assertStyleMatchesPrompt, CLAYMATION_AGENT_INSTRUCTIONS, CLAYMATION_IMAGE_DIRECTIVE, CLAYMATION_IMAGE_TREATMENT,
  CLAYMATION_STYLE_LINE, CLAYMATION_VIDEO_DIRECTIVE, resolveShotStyle, sameVisualStyle, StyleConflictError,
} from "./visual-style"
import type { MentionableEntity } from "./entity-mentions"

const IMAGE_BLOCK = [CLAYMATION_STYLE_LINE, CLAYMATION_IMAGE_DIRECTIVE, CLAYMATION_IMAGE_TREATMENT].join("\n\n")
const VIDEO_BLOCK = [CLAYMATION_STYLE_LINE, CLAYMATION_VIDEO_DIRECTIVE].join("\n\n")
// Everything the photorealistic block says, any of which would fight the clay.
const PHOTOREAL = /Strict live-action|Photographic treatment|live-action photorealism|real human|natural skin|film still|doll-like face|Required project style: photorealistic/

// The shape of the 2026-10-28 frame that came back as a real man.
const shotPrompt = "Stop-motion claymation close-up: @Matt's chunky plasticine puppet hand lifts a phone to the clay puppet head of @Matt, googly eyes wide."

describe("claymation image prompts", () => {
  it("append the image block in place of the photographic one", () => {
    const prompt = composeImagePrompt({ prompt: shotPrompt, style: "claymation", aspectRatio: "16:9", block: "shot" })
    expect(prompt).toContain("Required composition: 16:9.")
    expect(prompt).toContain(IMAGE_BLOCK)
    expect(prompt).not.toMatch(PHOTOREAL)
    expect(prompt.startsWith(shotPrompt)).toBe(true)
  })

  it("keep the aspect ratio a separate setting", () => {
    expect(composeImagePrompt({ prompt: shotPrompt, style: "claymation", aspectRatio: "9:16" })).toContain("Required composition: 9:16.")
  })

  it("say claymation the one way whatever spelling was stored", () => {
    const prompt = composeImagePrompt({ prompt: shotPrompt, style: "Claymation (stop-motion)", aspectRatio: "16:9" })
    expect(prompt).toContain(IMAGE_BLOCK)
    expect(prompt).not.toContain("Claymation (stop-motion).")
  })

  it("are idempotent when a composed prompt is composed again", () => {
    const once = composeImagePrompt({ prompt: shotPrompt, style: "claymation", aspectRatio: "16:9" })
    expect(composeImagePrompt({ prompt: once, style: "claymation", aspectRatio: "16:9" })).toBe(once)
  })

  it("let a character sheet keep its grid of views", () => {
    const matt = { id: "matt", type: "character", name: "Matt", description: "A plasticine puppet in a grey hoodie." } as MentionableEntity
    const sheet = buildEntityReferenceImagePrompt(matt, "claymation", composeLookDirectives("claymation", null, "character"))
    expect(sheet).toContain(CLAYMATION_STYLE_LINE)
    expect(sheet).toContain("No typography, labels, captions or UI.")
    expect(sheet).not.toMatch(PHOTOREAL)
    const composed = composeImagePrompt({ prompt: sheet, style: "claymation", block: "character" })
    expect(composed).toContain(CLAYMATION_IMAGE_TREATMENT)
    expect(composed).not.toContain("UI or grid")
  })
})

describe("claymation video prompts", () => {
  it("carry the video block and nothing photographic", () => {
    const prompt = ["0-4s: @Matt waves.", ...composeLookDirectives("claymation", null, "shot", "video")].join("\n\n")
    expect(prompt).toContain(VIDEO_BLOCK)
    expect(prompt).not.toContain(CLAYMATION_IMAGE_DIRECTIVE)
    expect(prompt).not.toMatch(PHOTOREAL)
  })

  it("leave other styles exactly as they were", () => {
    for (const style of ["Realistic - Photorealistic", "photorealistic", "Anime - Ghibli"]) {
      expect(composeLookDirectives(style, null, "shot", "video")).toEqual(composeLookDirectives(style, null, "shot"))
    }
  })
})

describe("the style conflict guard", () => {
  it("holds a clay prompt on a photorealistic project", () => {
    expect(() => assertStyleMatchesPrompt("photorealistic", ["A plasticine snail on a desk."])).toThrow(StyleConflictError)
    expect(() => assertStyleMatchesPrompt("Realistic - Photorealistic", [null, "Matt, a clay puppet with googly eyes."])).toThrow(StyleConflictError)
  })

  it("sends it when the user keeps photorealistic, or the project is not photorealistic", () => {
    expect(() => assertStyleMatchesPrompt("photorealistic", ["stop-motion snail"], "keep")).not.toThrow()
    expect(() => assertStyleMatchesPrompt("claymation", ["stop-motion snail"])).not.toThrow()
    expect(() => assertStyleMatchesPrompt("Anime - Ghibli", ["plasticine"])).not.toThrow()
    expect(() => assertStyleMatchesPrompt("photorealistic", ["A clay pot on a terracotta floor."])).not.toThrow()
  })

  it("reads the words a brief or script uses for claymation", () => {
    for (const text of ["claymation ad", "Stop-motion short", "stop motion", "plasticine figures", "clay puppets", "googly eyes"]) expect(asksForClaymation(text)).toBe(true)
    expect(asksForClaymation("a sculptor working clay", null)).toBe(false)
  })
})

describe("shot styles", () => {
  it("follow the project unless a shot was given its own on purpose", () => {
    expect(resolveShotStyle("claymation", { style: "photorealistic", metadata: {} })).toBe("claymation")
    expect(resolveShotStyle("claymation", { style: "photorealistic", metadata: { style_override: true } })).toBe("photorealistic")
    expect(resolveShotStyle("claymation", null)).toBe("claymation")
  })

  it("compare stored spellings of one style as equal", () => {
    expect(sameVisualStyle("photorealistic", "Realistic - Photorealistic")).toBe(true)
    expect(sameVisualStyle("claymation", "Claymation (stop-motion)")).toBe(true)
    expect(sameVisualStyle("photorealistic", "claymation")).toBe(false)
  })
})

describe("the Director's agents on a claymation project", () => {
  it("brief the three prompt-writing agents in clay and leave the rest alone", () => {
    const team = teamForVisualStyle(defaultDirectorTeam, "claymation")
    for (const key of ["character_asset", "storyboard", "video_prompt"] as const) expect(team[key].instructions.endsWith(CLAYMATION_AGENT_INSTRUCTIONS)).toBe(true)
    for (const key of ["script", "prompt", "continuity"] as const) expect(team[key]).toBe(defaultDirectorTeam[key])
    expect(teamForVisualStyle(defaultDirectorTeam, "photorealistic")).toBe(defaultDirectorTeam)
  })
})

describe("a platform key-service failure", () => {
  it("is reported as the platform's, not the user's key", () => {
    const failure = describeJobFailure({
      id: "job", provider: "openai", billing_mode: "byok", status: "failed",
      error: "Cloud KMS request failed (400): Billing is disabled for project 635295637422.",
    })
    expect(failure.advice).toContain("platform error")
    expect(failure.advice).not.toContain("Check or replace the key")
    expect(failure.platformError).toBe(true)
  })

  it("still points at the key when the key is the problem", () => {
    const failure = describeJobFailure({ id: "job", provider: "openai", billing_mode: "byok", status: "failed", error: "401 invalid api key" })
    expect(failure.advice).toContain("Check or replace the key")
  })
})
