import { z } from "zod"

export const timelineStepStatusSchema = z.enum(["pending", "running", "completed", "failed", "awaiting_approval", "cancelled"])

const timelineActionSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(240),
  // Pipeline actions carry enough context to execute without another model
  // guess, including named assets or shots. The old 200-character cap silently
  // discarded the entire next-step block for normal multi-asset workflows.
  intent: z.string().min(1).max(4_000),
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
  z.object({ type: z.literal("tool_execution"), executionId: z.string().uuid().optional(), tool: z.string().min(1).max(160), label: z.string().min(1).max(240), status: timelineStepStatusSchema, agent: z.string().min(1).max(120).optional(), detail: z.string().max(4_000).optional(), error: z.string().max(4_000).optional() }).strict(),
  z.object({ type: z.literal("proposal"), proposalId: z.string().uuid(), title: z.string().max(240).optional() }).strict(),
  z.object({ type: z.literal("media_result"), media: z.array(timelineMediaSchema).min(1).max(50) }).strict(),
  z.object({ type: z.literal("suggested_actions"), actions: z.array(timelineActionSchema).min(1).max(5) }).strict(),
  // The production track: which stages are done, which is in hand, and the XP
  // the episode has earned. Shown under the reply so a long production reads as
  // progress rather than an open-ended conversation.
  z.object({
    type: z.literal("production_progress"),
    headline: z.string().min(1).max(240),
    percent: z.number().int().min(0).max(100),
    completedStages: z.number().int().nonnegative(),
    totalStages: z.number().int().positive(),
    earnedXp: z.number().int().nonnegative().default(0),
    awardedXp: z.number().int().nonnegative().default(0),
    level: z.number().int().positive().default(1),
    stages: z.array(z.object({
      key: z.string().min(1).max(60),
      title: z.string().min(1).max(80),
      status: z.enum(["done", "current", "todo"]),
      xp: z.number().int().nonnegative().default(0),
    }).strict()).min(1).max(12),
  }).strict(),
  z.object({ type: z.literal("workflow_summary"), title: z.string().min(1).max(240), summary: z.string().min(1).max(8_000), completed: z.number().int().nonnegative().default(0), failed: z.number().int().nonnegative().default(0) }).strict(),
  z.object({ type: z.literal("warning"), code: z.string().min(1).max(120), message: z.string().min(1).max(4_000), recoverable: z.boolean().default(true), actions: z.array(timelineActionSchema).max(5).default([]) }).strict(),
])

export const directorTimelineSchema = z.array(directorTimelineBlockSchema).max(100)
export type DirectorTimelineBlock = z.infer<typeof directorTimelineBlockSchema>

/**
 * Parsed a block at a time, keeping whatever validates.
 *
 * Validating the array as a whole made every block depend on every other one:
 * a single label longer than its cap, one batch of more than fifty media, or a
 * block type written by a newer deploy than the page reading it, and the reply
 * lost its entire timeline — the production track and the next-step button
 * included. The button is how the user moves the production forward, so the
 * replies that dropped it were the long ones, on the biggest projects, where
 * losing it costs the most.
 *
 * A block that cannot be read is dropped on its own now. Whatever else the run
 * produced still reaches the user.
 */
export function parseDirectorTimeline(value: unknown): DirectorTimelineBlock[] {
  if (!Array.isArray(value)) return []
  const blocks: DirectorTimelineBlock[] = []
  for (const entry of value.slice(0, 100)) {
    const parsed = directorTimelineBlockSchema.safeParse(entry)
    if (parsed.success) blocks.push(parsed.data)
  }
  return blocks
}
