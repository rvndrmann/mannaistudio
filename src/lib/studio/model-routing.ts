import { z } from "zod"
import { calculateCreditCost } from "./credits"
import { generationProvider, imageGenerationModels, videoGenerationModels } from "./generation-models"

export const generationRequestSchema = z.object({
  type: z.enum(["image", "video"]),
  // Shots may be named by their storyboard number instead of their id. The
  // number is the reliable form for a model to produce, so the tool resolves
  // it against the episode rather than trusting the model to know the uuid.
  shotIds: z.array(z.string().uuid()).max(100).default([]),
  shotNumbers: z.array(z.number().int().positive().max(10_000)).max(100).default([]),
  episodeId: z.string().uuid().optional(),
  mentionedEntityIds: z.array(z.string().uuid()).max(20).default([]),
  source: z.enum(["text", "image"]).default("text"),
  referenceImageRequired: z.boolean().default(false),
  characterConsistencyPriority: z.boolean().default(false),
  productAccuracyPriority: z.boolean().default(false),
  dialogueRequired: z.boolean().default(false),
  durationSeconds: z.number().positive().max(120).default(5),
  aspectRatio: z.string().max(20).default("9:16"),
  resolution: z.string().max(20).default("720p"),
  preference: z.enum(["quality", "balanced", "speed", "cost"]).default("balanced"),
  // Set when the user picks a model in the chat generation block instead of
  // leaving the choice to preference-based routing.
  model: z.string().trim().max(100).optional(),
  audioEnabled: z.boolean().default(true),
  /**
   * How the attached images are read.
   *
   * `multi_image` sends every image as a plain reference, which is what a
   * storyboard shot wants: its own keyframe for composition plus the cast, all
   * of them locking a look and none of them claiming a position in time.
   *
   * `keyframe` assigns the first two images as the clip's opening and closing
   * frames, so it is only right when the caller genuinely has a start and an
   * end frame — the storyboard panel's own start/end flow. Left as the default
   * it applied to chat generations too, where the images after the keyframe are
   * cast references, and the first of those became the clip's last frame.
   */
  generationMode: z.enum(["keyframe", "multi_image"]).default("multi_image"),
  referencePaths: z.array(z.string().trim().min(1).max(2_000)).max(8).default([]),
  // Clips referenced for motion and look continuity, kept apart from image
  // references because the provider treats the two differently.
  videoReferencePaths: z.array(z.string().trim().min(1).max(2_000)).max(10).default([]),
  // Storyboard numbers for clips used as continuity inputs. Keeping these
  // separate from shotNumbers makes the output target unambiguous and lets the
  // approval card label the source clip before the job is submitted.
  videoReferenceShotNumbers: z.array(z.number().int().positive().max(10_000)).max(10).default([]),
  // Feeding a shot's existing frame back in locks the new render to the old
  // composition. That is occasionally wanted and never the default, so it must
  // be asked for rather than assumed.
  useExistingFrame: z.boolean().default(false),
  // Set when the user has curated the reference strip by hand. It is the cast
  // verbatim, so removing an entity sticks even though the prompt still names
  // it — otherwise the derivation would put it straight back.
  entityReferenceIds: z.array(z.string().uuid()).max(20).optional(),
}).strict().refine(
  (request) => (request.shotNumbers.length === 0 && request.videoReferenceShotNumbers.length === 0) || Boolean(request.episodeId),
  { message: "episodeId is required when target or reference shots are named by number", path: ["episodeId"] },
)

// Shot count before resolution: numbers stand in for ids until the tool looks
// them up, and estimates must still be correct at that point. A cost estimate
// legitimately names no shots at all, and quotes the per-shot price.
export function generationShotCount(request: { shotIds: string[]; shotNumbers: number[] }) {
  return request.shotIds.length || request.shotNumbers.length
}

export type GenerationRequest = z.infer<typeof generationRequestSchema>

export type GenerationModel = {
  provider: string
  model: string
  types: Array<"image" | "video">
  sources: Array<"text" | "image">
  referenceImages: boolean
  dialogue: boolean
  quality: number
  speed: number
  costPerSecond: number
  baseCredits: number
}

export const generationModels: GenerationModel[] = [
  ...imageGenerationModels.map((item, index) => ({ provider: generationProvider(item.id), model: item.id, types: ["image"] as Array<"image" | "video">, sources: ["text", "image"] as Array<"text" | "image">, referenceImages: true, dialogue: false, quality: Math.max(2, 5 - index / 3), speed: 3, costPerSecond: 0, baseCredits: calculateCreditCost(item.id, "image") })),
  ...videoGenerationModels.map((item, index) => ({ provider: generationProvider(item.id), model: item.id, types: ["video"] as Array<"image" | "video">, sources: ["text", "image"] as Array<"text" | "image">, referenceImages: true, dialogue: true, quality: Math.max(2, 5 - index / 6), speed: 3, costPerSecond: 0, baseCredits: 0 })),
]

export function routeGeneration(raw: unknown, models: GenerationModel[] = generationModels) {
  const request = generationRequestSchema.parse(raw)
  // Dialogue is a video capability, so it only narrows a video request. A still
  // frame cannot carry dialogue and no image model reports it, so applying this
  // to an image request emptied the candidate list and made routing impossible
  // — a shot whose script has spoken lines is described as dialogueRequired,
  // and asking for its storyboard frame then failed with "No configured model
  // supports this shot request" for a frame every image model could render.
  const needsDialogue = request.dialogueRequired && request.type === "video"
  const candidates = models.filter((model) => model.types.includes(request.type) && model.sources.includes(request.source) && (!request.referenceImageRequired || model.referenceImages) && (!needsDialogue || model.dialogue))
  if (!candidates.length) throw new Error("No configured model supports this shot request")
  const score = (model: GenerationModel) => request.preference === "quality" ? model.quality * 3 - model.costPerSecond : request.preference === "speed" ? model.speed * 3 - model.costPerSecond : request.preference === "cost" ? -(model.baseCredits + model.costPerSecond * request.durationSeconds) : model.quality + model.speed - model.costPerSecond
  // An explicit choice wins over preference scoring, but only among the models
  // that actually support the request, so the picker cannot route a shot to a
  // model that cannot produce it.
  const chosen = request.model ? candidates.find((model) => model.model === request.model) : undefined
  if (request.model && !chosen) throw new Error(`Model ${request.model} does not support this ${request.type} request`)
  const selected = chosen ?? [...candidates].sort((a, b) => score(b) - score(a))[0]
  const creditsPerShot = calculateCreditCost(selected.model, request.type, request.durationSeconds, {
    resolution: request.resolution,
    aspectRatio: request.aspectRatio,
  })
  return { request, selected, creditsPerShot, estimatedCredits: creditsPerShot * Math.max(1, generationShotCount(request)), reason: chosen ? "Selected explicitly in the generation block" : `Selected for ${request.preference} preference and requested capabilities` }
}
