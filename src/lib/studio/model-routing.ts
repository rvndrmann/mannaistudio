import { z } from "zod"

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
  generationMode: z.enum(["keyframe", "multi_image"]).default("keyframe"),
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
  { provider: "openai", model: "gpt-image-2", types: ["image"], sources: ["text", "image"], referenceImages: true, dialogue: false, quality: 4, speed: 4, costPerSecond: 0, baseCredits: 8 },
  { provider: "openai", model: "gpt-image-1.5", types: ["image"], sources: ["text", "image"], referenceImages: true, dialogue: false, quality: 3, speed: 5, costPerSecond: 0, baseCredits: 6 },
  { provider: "byteplus", model: "dola-seedream-5-0-pro-260628", types: ["image"], sources: ["text", "image"], referenceImages: true, dialogue: false, quality: 5, speed: 3, costPerSecond: 0, baseCredits: 4 },
  { provider: "byteplus", model: "dreamina-seedance-2-5-260628", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 5, speed: 2, costPerSecond: 50, baseCredits: 0 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-260128", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 5, speed: 2, costPerSecond: 4, baseCredits: 8 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-fast-260128", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 4, speed: 4, costPerSecond: 3, baseCredits: 6 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-mini-260615", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 3, speed: 5, costPerSecond: 2, baseCredits: 4 },
]

export function routeGeneration(raw: unknown, models: GenerationModel[] = generationModels) {
  const request = generationRequestSchema.parse(raw)
  const candidates = models.filter((model) => model.types.includes(request.type) && model.sources.includes(request.source) && (!request.referenceImageRequired || model.referenceImages) && (!request.dialogueRequired || model.dialogue))
  if (!candidates.length) throw new Error("No configured model supports this shot request")
  const score = (model: GenerationModel) => request.preference === "quality" ? model.quality * 3 - model.costPerSecond : request.preference === "speed" ? model.speed * 3 - model.costPerSecond : request.preference === "cost" ? -(model.baseCredits + model.costPerSecond * request.durationSeconds) : model.quality + model.speed - model.costPerSecond
  // An explicit choice wins over preference scoring, but only among the models
  // that actually support the request, so the picker cannot route a shot to a
  // model that cannot produce it.
  const chosen = request.model ? candidates.find((model) => model.model === request.model) : undefined
  if (request.model && !chosen) throw new Error(`Model ${request.model} does not support this ${request.type} request`)
  const selected = chosen ?? [...candidates].sort((a, b) => score(b) - score(a))[0]
  const creditsPerShot = Math.ceil(selected.baseCredits + selected.costPerSecond * request.durationSeconds)
  return { request, selected, creditsPerShot, estimatedCredits: creditsPerShot * Math.max(1, generationShotCount(request)), reason: chosen ? "Selected explicitly in the generation block" : `Selected for ${request.preference} preference and requested capabilities` }
}
