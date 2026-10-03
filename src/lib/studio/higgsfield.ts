import { z } from "zod"

export const GENJUTSU_MODEL = "higgsfield/genjutsu/motion-transfer/v1.0"
export const GENJUTSU_OBJECT_SWAP_MODEL = "higgsfield/genjutsu/object-swap/v1.0"
export const GENJUTSU_RESTYLE_MODEL = "higgsfield/genjutsu/restyle/v1.0"
export const SOUL_V2_MODEL = "higgsfield-ai/soul/v2/standard"
export const SOUL_V2_IMAGE_TO_IMAGE_MODEL = "higgsfield-ai/soul/v2/image-to-image"
export const GENJUTSU_MODELS = [GENJUTSU_MODEL, GENJUTSU_OBJECT_SWAP_MODEL, GENJUTSU_RESTYLE_MODEL] as const
export const isGenjutsuModel = (model: string) => (GENJUTSU_MODELS as readonly string[]).includes(model)
const baseUrl = "https://api.higgsfield.ai"
const commonInputSchema = z.object({
  prompt: z.string().max(10_000).default(""),
  video_url: z.url().max(2083),
  image_urls: z.array(z.url().max(2083)).min(1).max(8),
  resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
}).strict()
export const genjutsuInputSchema = commonInputSchema
export const genjutsuRestyleInputSchema = commonInputSchema.extend({ image_urls: z.array(z.url().max(2083)).max(5).default([]), preset_id: z.uuid() }).strict()
export const soulV2InputSchema = z.object({
  prompt: z.string().min(1).max(10_000), seed: z.number().int().min(1).max(1_000_000).optional(), style_id: z.string().optional(),
  custom_reference_id: z.uuid().nullable().optional(), custom_reference_strength: z.number().min(0).max(1).default(1),
  batch_size: z.union([z.literal(1), z.literal(4)]).default(1), resolution: z.enum(["720p", "1080p"]).default("720p"),
  aspect_ratio: z.enum(["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"]).default("4:3"), enhance_prompt: z.boolean().default(true),
}).strict()
export const soulV2ImageToImageInputSchema = soulV2InputSchema.extend({ image_url: z.url().max(2083) }).strict()

export class HiggsfieldProviderError extends Error {
  constructor(message: string, public status = 502) { super(message); this.name = "HiggsfieldProviderError" }
}

export function requireHiggsfieldCredentials() {
  const key = (process.env.HF_CREDENTIALS || process.env.HF_KEY || "").trim()
  if (!/^[^:\s]+:[^:\s]+$/.test(key)) throw new HiggsfieldProviderError("Higgsfield is not configured. Set HF_CREDENTIALS to KEY_ID:KEY_SECRET on the server.", 503)
  return key
}

async function call(path: string, input?: unknown) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: { Authorization: `Key ${requireHiggsfieldCredentials()}`, "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new HiggsfieldProviderError(typeof data.detail === "string" ? data.detail : typeof data.message === "string" ? data.message : `Higgsfield request failed (${response.status})`, response.status)
  return data as Record<string, any>
}

export async function getGenjutsuPresets() {
  const response = await call("models/higgsfield/genjutsu/restyle/v1.0/presets")
  const items: unknown[] = Array.isArray(response.items) ? response.items : []
  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const item = value as Record<string, unknown>
    if (typeof item.id !== "string" || typeof item.name !== "string" || (item.preview_url != null && typeof item.preview_url !== "string")) return []
    return [{ id: item.id, name: item.name, previewUrl: typeof item.preview_url === "string" ? item.preview_url : null }]
  })
}

export async function submitGenjutsuVideo(model: string, input: z.input<typeof genjutsuInputSchema> & { preset_id?: string }) {
  if (!isGenjutsuModel(model)) throw new HiggsfieldProviderError("Unsupported Genjutsu model", 400)
  const parsed = model === GENJUTSU_RESTYLE_MODEL ? genjutsuRestyleInputSchema.parse(input) : genjutsuInputSchema.parse(input)
  const response = await call(model, parsed)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

export async function getHiggsfieldVideoTask(id: string) {
  const response = await call(`requests/${encodeURIComponent(id)}/status`)
  const state = String(response.status || "").toLowerCase()
  const states: Record<string, "queued" | "running" | "succeeded" | "failed" | "cancelled"> = {
    queued: "queued", pending: "queued", in_queue: "queued", running: "running", processing: "running", in_progress: "running",
    completed: "succeeded", succeeded: "succeeded", failed: "failed", nsfw: "failed", canceled: "cancelled", cancelled: "cancelled",
  }
  const status = states[state]
  if (!status) throw new HiggsfieldProviderError(`Unknown Higgsfield request status: ${state}`)
  const video = response.video || response.result?.video
  const videoUrl = typeof video === "string" ? video : video?.url
  if (status === "succeeded" && !videoUrl) throw new HiggsfieldProviderError("Higgsfield completed the request without returning a video URL")
  return { status, content: { video_url: videoUrl as string | undefined }, error: { message: typeof response.error === "string" ? response.error : response.error?.message || response.message || (state === "nsfw" ? "Higgsfield rejected the generation under its content policy." : undefined) } }
}

export async function submitSoulV2Image(input: z.input<typeof soulV2InputSchema> | (z.input<typeof soulV2ImageToImageInputSchema>), model = SOUL_V2_MODEL) {
  if (model !== SOUL_V2_MODEL && model !== SOUL_V2_IMAGE_TO_IMAGE_MODEL) throw new HiggsfieldProviderError("Unsupported Soul V2 image model", 400)
  const parsed = model === SOUL_V2_IMAGE_TO_IMAGE_MODEL ? soulV2ImageToImageInputSchema.parse(input) : soulV2InputSchema.parse(input)
  const response = await call(model, parsed)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return an image request ID")
  return { id: response.request_id, response }
}

export async function getHiggsfieldImageTask(id: string) {
  const response = await call(`requests/${encodeURIComponent(id)}/status`)
  const state = String(response.status || "").toLowerCase()
  const states: Record<string, "pending" | "completed" | "failed"> = {
    queued: "pending", pending: "pending", in_queue: "pending", running: "pending", processing: "pending", in_progress: "pending",
    completed: "completed", succeeded: "completed", failed: "failed", nsfw: "failed", canceled: "failed", cancelled: "failed",
  }
  const status = states[state]
  if (!status) throw new HiggsfieldProviderError(`Unknown Higgsfield image status: ${state}`)
  const images = response.images || response.result?.images
  const urls = Array.isArray(images) ? images.map((item: unknown) => typeof item === "string" ? item : item && typeof item === "object" ? (item as Record<string, unknown>).url : null).filter((url: unknown): url is string => typeof url === "string") : []
  return { status, urls, error: typeof response.error === "string" ? response.error : response.error?.message || response.message || (state === "nsfw" ? "Higgsfield rejected the generation under its content policy." : undefined) }
}

export function genjutsuDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 4) throw new HiggsfieldProviderError("Genjutsu requires a source video at least 4 seconds long.", 400)
  return Math.min(seconds, 30)
}
