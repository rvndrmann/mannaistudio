import { z } from "zod"

export const revisionRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(12_000),
  change: z.object({ targetType: z.enum(["project", "series", "season", "episode", "scene", "shot", "asset"]), targetIds: z.array(z.string().uuid()).min(1).max(100), operation: z.enum(["update", "replace", "regenerate", "shorten", "reorder", "alternative"]), fields: z.record(z.string(), z.unknown()).default({}) }).strict(),
  dependencies: z.array(z.object({ type: z.string().max(100), id: z.string().uuid(), reason: z.string().max(1_000) })).max(200).default([]),
  lockedAssets: z.array(z.string().uuid()).max(500).default([]),
  estimatedCredits: z.number().int().nonnegative().default(0),
}).strict()

export function requiresRevisionApproval(raw: unknown) {
  const revision = revisionRequestSchema.parse(raw)
  return { revision, required: revision.estimatedCredits > 0 || ["replace", "regenerate"].includes(revision.change.operation) }
}
