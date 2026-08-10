import { describe, expect, it } from "vitest"
import { createStudioProjectInputSchema, creativeBriefSchema, directorChatInputSchema, isMissingProductionModeSchema } from "./domain"
import { normalizeStudioFeatureFlags, studioFeatureFlagDefaults } from "./feature-flags"
import { defineDirectorTool } from "./tool-registry"
import { updateCreativeBriefTool } from "./tool-registry"
import { z } from "zod"

describe("Studio domain validation", () => {
  it("applies safe creative brief defaults", () => {
    expect(creativeBriefSchema.parse({}).confirmedFields).toEqual([])
  })

  it("rejects unknown chat fields and invalid project identifiers", () => {
    expect(() => directorChatInputSchema.parse({ projectId: "other-user-project", message: "hello", idempotencyKey: "12345678", admin: true })).toThrow()
  })

  it("accepts canonical entity ids on Director chat requests", () => {
    const parsed = directorChatInputSchema.parse({
      projectId: "00000000-0000-4000-8000-000000000001",
      message: "Create an image with @Maya",
      mentionedEntityIds: ["00000000-0000-4000-8000-000000000002"],
      idempotencyKey: "mention-test",
    })
    expect(parsed.mentionedEntityIds).toEqual(["00000000-0000-4000-8000-000000000002"])
  })

  it("keeps every Studio capability disabled when settings are absent", () => {
    expect(normalizeStudioFeatureFlags(null)).toEqual(studioFeatureFlagDefaults)
  })

  it("preserves legacy project creation when no production mode is supplied", () => {
    expect(createStudioProjectInputSchema.parse({ name: "Existing flow", description: "A normal project" })).toEqual({ name: "Existing flow", description: "A normal project" })
  })

  it("accepts a supported additive production mode", () => {
    expect(createStudioProjectInputSchema.parse({ name: "Series", production_mode: "story_campaign", project_type: "brand_series" }).production_mode).toBe("story_campaign")
  })

  it("recognizes only missing production-mode schema errors for legacy fallback", () => {
    expect(isMissingProductionModeSchema({ code: "42703", message: "column production_mode does not exist" })).toBe(true)
    expect(isMissingProductionModeSchema({ code: "42501", message: "permission denied" })).toBe(false)
  })

  it("prevents costly tools from bypassing approval", () => {
    expect(() => defineDirectorTool({ name: "unsafe_generation", version: 1, risk: "costly", requiresApproval: false, input: z.object({}), async execute() { return {} } })).toThrow("must require approval")
  })

  it("requires approval before an AI-proposed brief update", () => {
    expect(updateCreativeBriefTool.requiresApproval).toBe(true)
    expect(updateCreativeBriefTool.risk).toBe("write")
  })
})
