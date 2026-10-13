import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { requestDirectorTool } from "./tool-service"
import { isImageGenerationModel, isVideoGenerationModel } from "./generation-models"
import { parseShotBeats } from "./shot-video-prompt"
import { entityKindSchema } from "./story"
import { mediaKind, storeDirectorUpload } from "./director-upload"
import { fetchPublicMedia } from "./media-import"

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
  referencePaths: z.array(z.string().trim().min(1).max(2_000)).max(8).default([]).describe("For the two storyboard kinds: stored image paths to use as references for this render, such as one returned by studio_upload_media."),
  idempotencyKey: z.string().min(8).max(200).optional().describe("Reuse the same key when retrying the same request."),
})

export const ownUploadSchema = z.object({
  episodeId: z.string().uuid().optional(),
  url: z.string().trim().min(8).max(2_083).describe("A public https link straight to the image, video or audio file. Not a web page that shows it."),
})

export const ownAttachSchema = z.object({
  episodeId: z.string().uuid().optional(),
  path: z.string().trim().min(1).max(2_000).describe("A stored media path from studio_upload_media, the storyboard, or a finished job."),
  entityId: z.string().uuid().optional().describe("Attach it to this character, location or asset as a reference image."),
  shotNumber: z.number().int().positive().max(10_000).optional().describe("Or set it on this storyboard shot."),
  as: z.enum(["frame", "video"]).default("frame").describe("For a shot: frame makes it the shot's storyboard image; video makes it the shot's clip."),
}).refine((input) => Boolean(input.entityId) !== Boolean(input.shotNumber), { message: "Name either an entityId or a shotNumber, not both" })

/**
 * A stored path may be handed to these tools by an assistant, so it is checked
 * against the caller's own folder for this project before anything uses it.
 * Without that a path guessed or copied from elsewhere could be attached to a
 * character and then signed for viewing as if it were theirs.
 */
function ownPath(context: AuthenticatedProjectContext, path: string) {
  if (path.includes("..") || !path.startsWith(`${context.user.id}/${context.project.id}/`)) {
    throw new Error("That file is not in this project. Use a path returned by studio_upload_media, the storyboard, or a finished job in this project.")
  }
  return path
}

/** Brings a file the user linked to into the project. */
export async function importOwnMedia(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownUploadSchema.parse(raw)
  const fetched = await fetchPublicMedia(input.url)
  const stored = await storeDirectorUpload(context, {
    episodeId,
    name: fetched.name,
    contentType: fetched.contentType,
    body: new Blob([new Uint8Array(fetched.bytes)], { type: fetched.contentType }),
  })
  return {
    path: stored.media.path,
    type: stored.media.type,
    name: stored.media.name,
    sizeBytes: stored.media.size,
    note: "Uploaded to the project. Attach it to a character or asset, or to a shot, with studio_attach_media; or pass the path in referencePaths when generating a storyboard image or video.",
  }
}

/** Puts a stored file onto a character or asset, or onto a shot. */
export async function attachOwnMedia(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownAttachSchema.parse(raw)
  const path = ownPath(context, input.path)
  const extension = path.split("?")[0].split(".").pop()?.toLowerCase() || ""
  const kind = mediaKind(["mp4", "webm", "mov"].includes(extension) ? "video/" : ["mp3", "m4a", "wav", "ogg"].includes(extension) ? "audio/" : "image/")
  if (input.entityId) {
    if (kind !== "image") throw new Error("A character or asset takes an image as its reference, not a video or audio file.")
    await requestDirectorTool(context, { tool: "attach_media_to_asset", input: { assetId: input.entityId, storagePath: path }, idempotencyKey: `own-attach-${randomUUID()}` }, { userAuthored: true })
    return { attached: true, entityId: input.entityId, path, note: "Added to its reference images. It now has art, so it no longer needs drawing before shots can be added." }
  }
  if (input.as === "video" && kind !== "video") throw new Error("That file is not a video, so it cannot be set as the shot's clip.")
  if (input.as === "frame" && kind !== "image") throw new Error("That file is not an image, so it cannot be set as the shot's frame.")
  const shotId = (await shotsByNumber(context, episodeId))(input.shotNumber!)
  await requestDirectorTool(context, { tool: "attach_media_to_shot", input: { shotId, storagePath: path, mediaType: input.as === "video" ? "video" : "image" }, idempotencyKey: `own-attach-${randomUUID()}` }, { userAuthored: true })
  return { attached: true, shotNumber: input.shotNumber, as: input.as, path, note: input.as === "video" ? "Set as this shot's clip." : "Set as this shot's storyboard image, replacing the one it had." }
}

export const ownScriptSchema = z.object({
  episodeId: z.string().uuid().optional(),
  script: text(200_000).describe("The whole script for this episode, exactly as the user wrote it. Replaces the episode's current script."),
})

export const ownEntitiesSchema = z.object({
  entities: z.array(z.object({
    kind: entityKindSchema.describe("character, location, prop, product, wardrobe or voice_profile."),
    name: text(200).describe("How shots will refer to it: a shot prompt names it as @Name."),
    prompt: text(10_000).describe("Its look, in the user's words. Saved as its description, which its reference art is drawn from."),
  })).min(1).max(50),
})

export const ownShotsSchema = z.object({
  episodeId: z.string().uuid().optional(),
  insertAfterShotNumber: z.number().int().min(0).max(1_000).optional().describe("Where the new shots go: 1 puts them after shot 1, 0 at the very front. Left out, they are added at the end."),
  shots: z.array(z.object({
    title: text(200),
    imagePrompt: text(20_000).describe("The storyboard frame for this shot: one frame, not a scene. Name characters and assets as @Name."),
    videoPrompt: text(20_000).optional().describe("What happens across the clip. Left out, the image prompt is used for the clip too."),
    description: z.string().trim().max(5_000).optional(),
    scriptText: z.string().trim().max(10_000).optional().describe("The line of script or voiceover this shot covers."),
    durationSeconds: z.number().positive().max(15).optional(),
    aspectRatio: z.string().trim().max(20).optional(),
  })).min(1).max(100),
})

/**
 * A video prompt in the form the storyboard stores.
 *
 * The studio keeps a clip's action as timed beats and refuses one without them.
 * A person writing their own prompt has no reason to know that, so words given
 * without timings are kept whole and placed in a single beat the length of the
 * shot. Nothing is rewritten; a prompt that already has beats is left alone.
 */
function asTimedBeats(prompt: string, seconds: number) {
  if (parseShotBeats(prompt).length) return prompt
  return `0-${Math.max(1, Math.round(seconds))}s: ${prompt}`
}

/** Replaces the episode's script with the user's own. */
export async function saveOwnScript(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownScriptSchema.parse(raw)
  await requestDirectorTool(context, {
    tool: "update_script",
    input: { episodeId, content: input.script, summary: "Script written by the user" },
    idempotencyKey: `own-script-${randomUUID()}`,
  }, { userAuthored: true })
  return { saved: true, characters: input.script.length, note: "Script saved as written. Nothing else was changed." }
}

/** Creates characters, locations and assets from the user's own descriptions. */
export async function createOwnEntities(context: AuthenticatedProjectContext, raw: unknown) {
  const input = ownEntitiesSchema.parse(raw)
  const result = await requestDirectorTool(context, {
    tool: "create_production_entities_batch",
    // One that already exists is left as it is rather than failing the rest.
    input: { entities: input.entities.map((entity) => ({ kind: entity.kind, name: entity.name, description: entity.prompt })), skipExisting: true },
    idempotencyKey: `own-entities-${randomUUID()}`,
  }, { userAuthored: true }) as { data?: { created?: Array<Record<string, unknown>>; skipped?: Array<Record<string, unknown>> } }
  const brief = (entity: Record<string, unknown>) => ({ entityId: entity.id, name: entity.name, kind: entity.kind ?? entity.type })
  return {
    created: (result.data?.created || []).map(brief),
    alreadyExisted: (result.data?.skipped || []).map(brief),
    note: "Created with no reference art yet. Draw it with studio_generate (kind character_or_asset_image): the storyboard cannot be built until every character and asset has art.",
  }
}

/** Adds storyboard shots written by the user. */
export async function createOwnShots(context: AuthenticatedProjectContext, episodeId: string, raw: unknown) {
  const input = ownShotsSchema.parse(raw)
  const projectAspect = typeof context.project.default_aspect === "string" && context.project.default_aspect ? context.project.default_aspect : "16:9"
  const result = await requestDirectorTool(context, {
    tool: "create_storyboard_batch",
    input: {
      episodeId,
      // Never replaces: adding shots must not be able to delete a storyboard.
      replaceExisting: false,
      ...(input.insertAfterShotNumber === undefined ? {} : { insertAfterShotNumber: input.insertAfterShotNumber }),
      shots: input.shots.map((shot) => {
        const durationSeconds = shot.durationSeconds ?? 4
        return {
          title: shot.title,
          description: shot.description || "",
          scriptText: shot.scriptText || "",
          prompt: shot.imagePrompt,
          videoPrompt: asTimedBeats(shot.videoPrompt || shot.imagePrompt, durationSeconds),
          durationSeconds,
          aspectRatio: shot.aspectRatio || projectAspect,
        }
      }),
    },
    idempotencyKey: `own-shots-${randomUUID()}`,
  }, { userAuthored: true }) as { data?: { created?: Array<{ id?: string; order_index?: number; title?: string }> } }
  const created = [...(result.data?.created || [])].sort((first, second) => Number(first.order_index) - Number(second.order_index))
  return {
    // The numbers to use from here on: a shot's number is its place in the
    // storyboard, which is what every other tool takes.
    added: created.map((shot) => ({ shotNumber: Number(shot.order_index) + 1, shotId: shot.id, title: shot.title })),
    totalShots: (await shotsByNumber(context, episodeId)).count,
    note: "Shots added with the prompts as written. Render frames with studio_generate (kind storyboard_image), then clips (kind storyboard_video).",
  }
}

async function shotsByNumber(context: AuthenticatedProjectContext, episodeId: string) {
  const { data, error } = await context.supabase.from("creator_shots").select("id,order_index").eq("episode_id", episodeId).order("order_index")
  if (error) throw error
  const shots = data || []
  const byNumber = new Map(shots.map((shot) => [Number(shot.order_index) + 1, String(shot.id)]))
  const lookup = (number: number) => {
    const id = byNumber.get(number)
    if (!id) throw new Error(`Shot ${number} does not exist in this episode. It has ${shots.length} shots.`)
    return id
  }
  return Object.assign(lookup, { count: shots.length })
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

  // Refused here, by name, rather than three layers down as a routing error.
  if (input.model && !(input.kind === "storyboard_video" ? isVideoGenerationModel(input.model) : isImageGenerationModel(input.model))) {
    throw new Error(`"${input.model}" is not ${input.kind === "storyboard_video" ? "a video" : "an image"} model this studio offers. Call studio_list_models for the ids.`)
  }

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
        ...(input.referencePaths.length ? { referencePaths: input.referencePaths.map((path) => ownPath(context, path)) } : {}),
      },
      prompts,
      idempotencyKey,
    },
    idempotencyKey,
    episodeId,
  // Marks the request as the user's own, which is what lets a named image
  // model stand. It is still a costly tool, so it still needs approval.
  }, { userAuthored: true })
}
