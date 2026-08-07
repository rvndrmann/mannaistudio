import { z } from "zod"

export const seriesBibleSchema = z.object({
  premise: z.string().trim().max(10_000).default(""),
  genre: z.string().trim().max(200).default(""),
  tone: z.string().trim().max(1_000).default(""),
  audience: z.string().trim().max(1_000).default(""),
  format: z.object({ episodeDurationSeconds: z.number().int().positive().max(14_400).nullable().default(null), aspectRatio: z.string().max(20).default("9:16"), episodeCount: z.number().int().positive().max(1_000).nullable().default(null) }).default({ episodeDurationSeconds: null, aspectRatio: "9:16", episodeCount: null }),
  worldRules: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  visualRules: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  locationRules: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  wardrobeRules: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  productIntegrationRules: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  contentRestrictions: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  seasonArc: z.string().trim().max(20_000).default(""),
  episodeSummaries: z.array(z.object({ episode: z.number().int().positive(), summary: z.string().trim().max(10_000) })).max(1_000).default([]),
}).strict()

export const entityKindSchema = z.enum(["character", "location", "prop", "product", "wardrobe", "voice_profile"])
export type SeriesBible = z.infer<typeof seriesBibleSchema>
export type EntityKind = z.infer<typeof entityKindSchema>

export function legacyEntityType(kind: EntityKind): "character" | "scene" | "prop" {
  if (kind === "character" || kind === "voice_profile") return "character"
  if (kind === "location") return "scene"
  return "prop"
}

export function entityHandle(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || `entity-${Date.now()}`
}
