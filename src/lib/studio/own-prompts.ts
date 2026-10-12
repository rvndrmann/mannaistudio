import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { requestDirectorTool } from "./tool-service"

/**
 * Working without the agent.
 *
 * The Director writes prompts; this is for the person who already has theirs.
 * Both halves reuse the Director's own tools rather than a second copy of them,
 * so a prompt saved here is checked, stored and later rendered exactly as one
 * the agent wrote — the only difference is who wrote the words.
 *
 * Saving a prompt is the user editing their own text, the same as typing into
 * the prompt box in the studio, so it is written straight away. Generating
 * spends credits, so it always comes back as a proposal with its cost.
 */

const text = (max: number) => z.string().trim().min(1).max(max)

export const ownPromptsSchema = z.object({
  episodeId: z.string().uuid().optional(),
  shots: z.array(z.object({
    shotNumber: z.number().int().positive().max(10_000).describe("The storyboard number as shown to the user, counting from 1."),
    imagePrompt: text(20_000).optional().describe("The storyboard image prompt for this shot: one frame."),
    videoPrompt: text(20_000).optional().describe("The video prompt for this shot: what happens across the clip."),
  }).refine((shot) => shot.imagePrompt || shot.videoPrompt, { message: "Give an imagePrompt, a videoPrompt, or both" })).max(100).default([]),
  entities: z.array(z.object({
    entityId: z.string().uuid().describe("A character, location or asset id from studio_storyboard."),
    prompt: text(10_000).describe("The look of this character or asset. Saved as its description, which its reference art is drawn from."),
  })).max(50).default([]),
}).refine((input) => input.shots.length + input.entities.length > 0, { message: "Send at least one shot or entity prompt" })

export const ownGenerationSchema = z.object({
  episodeId: z.string().uuid().optional(),
  kind: z.enum(["storyboard_image", "storyboard_video", "character_or_asset_image"]),
  shotNumbers: z.array(z.number().int().positive().max(10_000)).max(50).default([]).describe("Storyboard shots to render, for the two storyboard kinds."),
  entityIds: z.array(z.string().uuid()).max(12).default([]).describe("Characters or assets to draw, for character_or_asset_image."),
  prompts: z.record(z.string(), text(20_000)).default({}).describe("Your own prompt for this render, keyed by shot number (\"3\") or entity id. Anything left out uses the prompt already saved."),
  model: z.string().trim().max(100).optional(),
  durationSeconds: z.number().positive().max(120).optional(),
  aspectRatio: z.string().trim().max(20).optional(),
  resolution: z.string().trim().max(20).optional(),
  idempotencyKey: z.string().min(8).max(200).optional().describe("Reuse the same key when retrying the same request."),
})

async function shotsByNumber(context: AuthenticatedProjectContext, episodeId: string) {
  const { data, error } = await context.supabase.from("creator_shots").select("id,order_index").eq("episode_id", episodeId).order("order_index")
  if (error) throw error
  const shots = data || []
  const byNumber = new Map(shots.map((shot) => [Number(shot.order_index) + 1, String(shot.id)]))
  return (number: number) => {
    const id = byNumber.get(number)
    if (!id) throw new Error(`Shot ${number} does not exist in this episode. It has ${shots.length} shots.`)
    return id
  }
}

/** Writes the user's own prompts onto shots and entities, as written. */
export async function saveOwnPrompts(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownPromptsSchema.parse(raw)
  const shotId = input.shots.length ? await shotsByNumber(context, episodeId) : null
  // Resolved before anything is written, so a bad shot number saves nothing
  // rather than half of the list.
  const shotWrites = input.shots.map((shot) => ({ ...shot, id: shotId!(shot.shotNumber) }))
  const saved: Array<{ shotNumber?: number; entityId?: string; saved: string[] }> = []
  for (const shot of shotWrites) {
    await requestDirectorTool(context, {
      tool: "update_shot",
      input: { shotId: shot.id, patch: { ...(shot.imagePrompt ? { prompt: shot.imagePrompt } : {}), ...(shot.videoPrompt ? { video_prompt: shot.videoPrompt } : {}) } },
      idempotencyKey: `own-prompt-${randomUUID()}`,
    }, { userAuthored: true })
    saved.push({ shotNumber: shot.shotNumber, saved: [shot.imagePrompt ? "imagePrompt" : "", shot.videoPrompt ? "videoPrompt" : ""].filter(Boolean) })
  }
  for (const entity of input.entities) {
    await requestDirectorTool(context, {
      tool: "update_asset",
      input: { assetId: entity.entityId, patch: { description: entity.prompt } },
      idempotencyKey: `own-prompt-${randomUUID()}`,
    }, { userAuthored: true })
    saved.push({ entityId: entity.entityId, saved: ["prompt"] })
  }
  return { saved, note: "Saved as written. Nothing has been generated; use studio_generate to render from these prompts." }
}

/** Asks for a render from the user's own prompts. Always returns a proposal to approve. */
export async function proposeOwnGeneration(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownGenerationSchema.parse(raw)
  const idempotencyKey = input.idempotencyKey || `own-generation-${randomUUID()}`

  if (input.kind === "character_or_asset_image") {
    if (!input.entityIds.length) throw new Error("Name the characters or assets to draw in entityIds.")
    const prompts = Object.fromEntries(Object.entries(input.prompts).filter(([key]) => input.entityIds.includes(key)))
    return requestDirectorTool(context, {
      tool: "generate_entity_reference_art",
      input: { entityIds: input.entityIds, prompts, ...(input.model ? { model: input.model } : {}), idempotencyKey },
      idempotencyKey,
    })
  }

  if (!input.shotNumbers.length) throw new Error("Name the storyboard shots to render in shotNumbers.")
  const shotId = await shotsByNumber(context, episodeId)
  const shotIds = input.shotNumbers.map(shotId)
  // Keyed by id from here on: that is what the duration lookup and the job
  // rows read, and a number means nothing once the storyboard is reordered.
  const prompts: Record<string, string> = {}
  input.shotNumbers.forEach((number, index) => {
    const written = input.prompts[String(number)] ?? input.prompts[shotIds[index]]
    if (written) prompts[shotIds[index]] = written
  })
  const projectAspect = typeof context.project.default_aspect === "string" && context.project.default_aspect ? context.project.default_aspect : undefined
  const aspectRatio = input.aspectRatio || projectAspect
  return requestDirectorTool(context, {
    tool: "submit_generation",
    input: {
      request: {
        type: input.kind === "storyboard_video" ? "video" : "image",
        shotIds,
        episodeId,
        ...(input.model ? { model: input.model } : {}),
        ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
      },
      prompts,
      idempotencyKey,
    },
    idempotencyKey,
    episodeId,
  })
}
