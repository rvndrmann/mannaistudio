import { z } from "zod"

export const productionModes = ["legacy", "quick_video", "story_campaign", "ai_show"] as const
export const projectTypes = ["unspecified", "ai_ad", "brand_series", "short_drama", "narrative_film"] as const

export const productionModeSchema = z.enum(productionModes)
export const projectTypeSchema = z.enum(projectTypes)

export const creativeBriefSchema = z.object({
  objective: z.string().trim().max(2_000).default(""),
  audience: z.string().trim().max(1_000).default(""),
  platform: z.string().trim().max(100).default(""),
  durationSeconds: z.number().int().positive().max(14_400).nullable().default(null),
  aspectRatio: z.string().trim().max(20).default(""),
  style: z.string().trim().max(1_000).default(""),
  productOrService: z.string().trim().max(2_000).default(""),
  offer: z.string().trim().max(2_000).default(""),
  language: z.string().trim().max(80).default(""),
  dialogueRequirements: z.string().trim().max(2_000).default(""),
  budgetCredits: z.number().int().nonnegative().nullable().default(null),
  deliveryExpectations: z.string().trim().max(2_000).default(""),
  confirmedFields: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
}).strict()

export type CreativeBrief = z.infer<typeof creativeBriefSchema>
export type ProductionMode = z.infer<typeof productionModeSchema>
export type ProjectType = z.infer<typeof projectTypeSchema>

export const projectContextSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).nullable(),
  productionMode: productionModeSchema,
  projectType: projectTypeSchema,
  creativeBrief: creativeBriefSchema,
  defaultStyle: z.string().max(200),
  defaultAspect: z.string().max(20),
  featureFlags: z.record(z.string(), z.boolean()),
})

export type ProjectContext = z.infer<typeof projectContextSchema>

export const directorChatInputSchema = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(12_000),
  mentionedEntityIds: z.array(z.string().uuid()).max(20).default([]),
  model: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
  // Opt-in so existing callers keep receiving one JSON body.
  stream: z.boolean().default(false),
}).strict()

export const createStudioProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).nullable().optional(),
  cover_image: z.string().url().nullable().optional(),
  production_mode: productionModeSchema.optional(),
  project_type: projectTypeSchema.optional(),
}).strict()

export const toolRiskSchema = z.enum(["read", "write", "costly", "destructive"])

export const toolExecutionResultSchema = z.object({
  ok: z.boolean(),
  tool: z.string().min(1),
  executionId: z.string().uuid(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

export function parseCreativeBrief(value: unknown): CreativeBrief {
  return creativeBriefSchema.parse(value ?? {})
}

export function isMissingProductionModeSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const value = error as { code?: unknown; message?: unknown }
  const message = typeof value.message === "string" ? value.message.toLowerCase() : ""
  return value.code === "42703" || ((message.includes("production_mode") || message.includes("project_type")) && (message.includes("column") || message.includes("schema cache")))
}
