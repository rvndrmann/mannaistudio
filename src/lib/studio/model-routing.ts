import { z } from "zod"

export const generationRequestSchema = z.object({
  type: z.enum(["image", "video"]),
  shotIds: z.array(z.string().uuid()).min(1).max(100),
  source: z.enum(["text", "image"]).default("text"),
  referenceImageRequired: z.boolean().default(false),
  characterConsistencyPriority: z.boolean().default(false),
  productAccuracyPriority: z.boolean().default(false),
  dialogueRequired: z.boolean().default(false),
  durationSeconds: z.number().positive().max(120).default(5),
  aspectRatio: z.string().max(20).default("9:16"),
  resolution: z.string().max(20).default("720p"),
  preference: z.enum(["quality", "balanced", "speed", "cost"]).default("balanced"),
}).strict()

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
  { provider: "byteplus", model: "dola-seedream-5-0-pro-260628", types: ["image"], sources: ["text", "image"], referenceImages: true, dialogue: false, quality: 5, speed: 3, costPerSecond: 0, baseCredits: 4 },
  { provider: "byteplus", model: "dreamina-seedance-2-5-260628", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 5, speed: 2, costPerSecond: 5, baseCredits: 10 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-260128", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 5, speed: 2, costPerSecond: 4, baseCredits: 8 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-fast-260128", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 4, speed: 4, costPerSecond: 3, baseCredits: 6 },
  { provider: "byteplus", model: "dreamina-seedance-2-0-mini-260615", types: ["video"], sources: ["text", "image"], referenceImages: true, dialogue: true, quality: 3, speed: 5, costPerSecond: 2, baseCredits: 4 },
]

export function routeGeneration(raw: unknown, models: GenerationModel[] = generationModels) {
  const request = generationRequestSchema.parse(raw)
  const candidates = models.filter((model) => model.types.includes(request.type) && model.sources.includes(request.source) && (!request.referenceImageRequired || model.referenceImages) && (!request.dialogueRequired || model.dialogue))
  if (!candidates.length) throw new Error("No configured model supports this shot request")
  const score = (model: GenerationModel) => request.preference === "quality" ? model.quality * 3 - model.costPerSecond : request.preference === "speed" ? model.speed * 3 - model.costPerSecond : request.preference === "cost" ? -(model.baseCredits + model.costPerSecond * request.durationSeconds) : model.quality + model.speed - model.costPerSecond
  const selected = [...candidates].sort((a, b) => score(b) - score(a))[0]
  const creditsPerShot = Math.ceil(selected.baseCredits + selected.costPerSecond * request.durationSeconds)
  return { request, selected, creditsPerShot, estimatedCredits: creditsPerShot * request.shotIds.length, reason: `Selected for ${request.preference} preference and requested capabilities` }
}
