import { z } from "zod"

export const timelineStepStatusSchema = z.enum(["pending", "running", "completed", "failed", "awaiting_approval", "cancelled"])

const timelineActionSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(240),
  intent: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()).default({}),
  risk: z.enum(["read", "write", "costly", "destructive"]).default("read"),
  recommended: z.boolean().default(false),
}).strict()

const timelineMediaSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  url: z.string().min(1).max(4_000),
  name: z.string().max(240).optional(),
  prompt: z.string().max(20_000).optional(),
  provider: z.string().max(120).optional(),
  model: z.string().max(160).optional(),
}).strict()

export const directorTimelineBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), title: z.string().max(240), steps: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).max(240), status: timelineStepStatusSchema, detail: z.string().max(2_000).optional() }).strict()).max(50) }).strict(),
  z.object({ type: z.literal("tool_execution"), executionId: z.string().uuid().optional(), tool: z.string().min(1).max(160), label: z.string().min(1).max(240), status: timelineStepStatusSchema, detail: z.string().max(4_000).optional(), error: z.string().max(4_000).optional() }).strict(),
  z.object({ type: z.literal("proposal"), proposalId: z.string().uuid(), title: z.string().max(240).optional() }).strict(),
  z.object({ type: z.literal("media_result"), media: z.array(timelineMediaSchema).min(1).max(50) }).strict(),
  z.object({ type: z.literal("suggested_actions"), actions: z.array(timelineActionSchema).min(1).max(5) }).strict(),
  z.object({ type: z.literal("workflow_summary"), title: z.string().min(1).max(240), summary: z.string().min(1).max(8_000), completed: z.number().int().nonnegative().default(0), failed: z.number().int().nonnegative().default(0) }).strict(),
  z.object({ type: z.literal("warning"), code: z.string().min(1).max(120), message: z.string().min(1).max(4_000), recoverable: z.boolean().default(true), actions: z.array(timelineActionSchema).max(5).default([]) }).strict(),
])

export const directorTimelineSchema = z.array(directorTimelineBlockSchema).max(100)
export type DirectorTimelineBlock = z.infer<typeof directorTimelineBlockSchema>

export function parseDirectorTimeline(value: unknown): DirectorTimelineBlock[] {
  const parsed = directorTimelineSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}
