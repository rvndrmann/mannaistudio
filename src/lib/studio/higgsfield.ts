import { prepareImageModelPrompt } from "./image-prompt-composition"
import { activeCredentialPart } from "@/lib/byok/active-credential"
import { assertAllowedProviderUrl } from "@/lib/byok/providers"
import { z } from "zod"

export const GENJUTSU_MODEL = "higgsfield/genjutsu/motion-transfer/v1.0"
export const GENJUTSU_OBJECT_SWAP_MODEL = "higgsfield/genjutsu/object-swap/v1.0"
export const GENJUTSU_RESTYLE_MODEL = "higgsfield/genjutsu/restyle/v1.0"
export const SOUL_V2_MODEL = "higgsfield-ai/soul/v2/standard"
export const SOUL_V2_IMAGE_TO_IMAGE_MODEL = "higgsfield-ai/soul/v2/image-to-image"
// MiniMax H3 (Hailuo-03 preview) through Higgsfield's Video Generation V2.
// The studio id carries the provider prefix every Higgsfield model has here;
// the API path is the same id without it.
export const HIGGSFIELD_MINIMAX_H3_MODEL = "higgsfield/minimax/h3/text-to-video"
const HIGGSFIELD_MINIMAX_H3_PATH = "minimax/h3/text-to-video"
export const isHiggsfieldMinimaxH3Model = (model: string) => model === HIGGSFIELD_MINIMAX_H3_MODEL
// Seedance 2.0 Reference to Video through Higgsfield: images, clips and audio
// in, one clip out. Same prefix rule as above.
export const HIGGSFIELD_SEEDANCE_2_MODEL = "higgsfield/bytedance/seedance-2.0/reference-to-video"
const HIGGSFIELD_SEEDANCE_2_PATH = "bytedance/seedance-2.0/reference-to-video"
export const isHiggsfieldSeedanceModel = (model: string) => model === HIGGSFIELD_SEEDANCE_2_MODEL
// Wan 3.0 Prime Reference to Video through Higgsfield.
export const HIGGSFIELD_WAN_3_PRIME_MODEL = "higgsfield/alibaba/wan-3.0-prime/reference-to-video"
const HIGGSFIELD_WAN_3_PRIME_PATH = "alibaba/wan-3.0-prime/reference-to-video"
export const isHiggsfieldWanModel = (model: string) => model === HIGGSFIELD_WAN_3_PRIME_MODEL
// Kling 3.0 Standard Image to Video through Higgsfield.
export const HIGGSFIELD_KLING_3_STD_MODEL = "higgsfield/kling-video/v3.0/std/image-to-video"
const HIGGSFIELD_KLING_3_STD_PATH = "kling-video/v3.0/std/image-to-video"
export const isHiggsfieldKlingModel = (model: string) => model === HIGGSFIELD_KLING_3_STD_MODEL
// Kling O3 Image Reference through Higgsfield.
export const HIGGSFIELD_KLING_O3_MODEL = "higgsfield/kling-video/o3/image-reference"
const HIGGSFIELD_KLING_O3_PATH = "kling-video/o3/image-reference"
export const isHiggsfieldKlingO3Model = (model: string) => model === HIGGSFIELD_KLING_O3_MODEL
// Kling O3 Video Reference through Higgsfield: re-renders from a source clip.
export const HIGGSFIELD_KLING_O3_VIDEO_MODEL = "higgsfield/kling-video/o3/video-reference"
const HIGGSFIELD_KLING_O3_VIDEO_PATH = "kling-video/o3/video-reference"
export const isHiggsfieldKlingO3VideoModel = (model: string) => model === HIGGSFIELD_KLING_O3_VIDEO_MODEL
// Cinema Studio 4.0 is Higgsfield's own model, so its API path already starts
// with the provider name and is used as the studio id unchanged.
export const HIGGSFIELD_CINEMA_STUDIO_4_MODEL = "higgsfield/cinema-studio/4.0"
export const isHiggsfieldCinemaStudioModel = (model: string) => model === HIGGSFIELD_CINEMA_STUDIO_4_MODEL
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
const minimaxH3AspectRatios = ["auto", "adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const
export const minimaxH3InputSchema = z.object({
  prompt: z.string().min(1),
  duration: z.number().int().min(5).max(15).default(5),
  resolution: z.literal("2K").default("2K"),
  aspect_ratio: z.enum(minimaxH3AspectRatios).default("auto"),
  aigc_watermark: z.boolean().default(false),
}).strict()
const seedanceAspectRatios = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const
const seedanceResolutions = ["480p", "720p", "1080p", "4k"] as const
const referenceUrlList = z.array(z.url().max(2083)).min(1).optional()
export const higgsfieldSeedanceInputSchema = z.object({
  prompt: z.string().min(1).optional(),
  duration: z.number().int().min(4).max(15).default(5),
  audio_urls: referenceUrlList,
  image_urls: referenceUrlList,
  video_urls: referenceUrlList,
  resolution: z.enum(seedanceResolutions).default("720p"),
  aspect_ratio: z.enum(seedanceAspectRatios).default("16:9"),
  generate_audio: z.boolean().default(true),
}).strict()
const wanAspectRatios = ["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"] as const
const wanResolutions = ["480p", "720p", "1080p"] as const
export const higgsfieldWanInputSchema = z.object({
  prompt: z.string().min(1),
  duration: z.number().int().min(2).max(30).default(5),
  audio_urls: z.array(z.url().max(2083)).min(1).max(5).optional(),
  image_urls: referenceUrlList,
  video_urls: z.array(z.url().max(2083)).min(1).max(5).optional(),
  resolution: z.enum(wanResolutions).default("1080p"),
  aspect_ratio: z.enum(wanAspectRatios).default("adaptive"),
  generate_audio: z.boolean().default(true),
  enable_thinking: z.boolean().default(false),
}).strict()
export const higgsfieldKlingInputSchema = z.object({
  sound: z.enum(["on", "off"]).default("on"),
  prompt: z.string().min(1).optional(),
  duration: z.number().int().min(3).max(15).default(5),
  cfg_scale: z.number().min(0).max(1).default(0.5),
  image_url: z.url().max(2083),
  multi_shots: z.boolean().default(false),
  last_image_url: z.url().max(2083).optional(),
}).strict()
export const higgsfieldKlingO3InputSchema = z.object({
  mode: z.enum(["std", "pro", "4k"]).default("std"),
  sound: z.enum(["on", "off"]).default("off"),
  prompt: z.string().min(1).optional(),
  duration: z.number().int().min(3).max(15).default(5),
  shot_type: z.enum(["customize", "intelligent"]).default("customize"),
  image_urls: referenceUrlList,
  multi_shots: z.boolean().default(false),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  last_frame_url: z.url().max(2083).optional(),
  first_frame_url: z.url().max(2083).optional(),
}).strict()
export const higgsfieldKlingO3VideoInputSchema = z.object({
  mode: z.enum(["std", "pro"]).default("pro"),
  prompt: z.string().min(1),
  duration: z.number().int().min(3).max(10).default(5),
  image_urls: referenceUrlList,
  video_urls: z.array(z.url().max(2083)).min(1),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
}).strict()
// Higgsfield's published page for this model shows only `prompt`. The rest of
// this shape is the part of its schema that could be confirmed elsewhere:
// 4-30 seconds, 480p or 720p, sound on by default, up to 30 `image_urls`. The
// names of its video and audio inputs and of its camera, lighting and genre
// controls could not be, and the schema refuses unknown fields, so none of
// those is sent.
export const higgsfieldCinemaStudioInputSchema = z.object({
  prompt: z.string().min(1),
  duration: z.number().int().min(4).max(30).default(5),
  resolution: z.enum(["480p", "720p"]).default("720p"),
  aspect_ratio: z.enum(seedanceAspectRatios).optional(),
  generate_audio: z.boolean().default(true),
  image_urls: z.array(z.url().max(2083)).min(1).max(30).optional(),
}).strict()
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
  const key = (activeCredentialPart("higgsfield", "apiKey") ?? process.env.HF_CREDENTIALS ?? process.env.HF_KEY ?? "").trim()
  if (!/^[^:\s]+:[^:\s]+$/.test(key)) throw new HiggsfieldProviderError("Higgsfield is not configured. Set HF_CREDENTIALS to KEY_ID:KEY_SECRET on the server.", 503)
  return key
}

async function call(path: string, input?: unknown) {
  assertAllowedProviderUrl("higgsfield", `${baseUrl}/${path}`)
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

/**
 * Text to video only: the endpoint takes no image or video input, so a shot's
 * keyframe and references are not sent. It renders at 2K and between 5 and 15
 * whole seconds; a request outside that is brought inside it rather than
 * refused, since the studio's own duration picker starts lower.
 */
export async function submitHiggsfieldMinimaxH3Video(input: { prompt: string; duration?: number; aspectRatio?: string }) {
  const ratio = (minimaxH3AspectRatios as readonly string[]).includes(input.aspectRatio || "") ? input.aspectRatio : "auto"
  const seconds = Math.min(15, Math.max(5, Math.round(Number(input.duration) || 5)))
  const parsed = minimaxH3InputSchema.safeParse({ prompt: input.prompt.trim(), duration: seconds, aspect_ratio: ratio })
  if (!parsed.success) throw new HiggsfieldProviderError("MiniMax H3 needs a prompt.", 400)
  const response = await call(HIGGSFIELD_MINIMAX_H3_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/**
 * Every input is optional at the endpoint, so the one thing checked here is
 * that the request carries something to make a video from. A list with nothing
 * in it is left out rather than sent empty, and only fetchable URLs are passed:
 * a BytePlus asset identity means nothing to this provider.
 */
export async function submitHiggsfieldSeedanceVideo(input: {
  prompt?: string
  duration?: number
  resolution?: string
  aspectRatio?: string
  imageUrls?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  audioEnabled?: boolean
}) {
  const urls = (values?: string[]) => {
    const list = Array.from(new Set((values || []).filter((value) => /^https?:\/\//i.test(value))))
    return list.length ? list : undefined
  }
  const prompt = input.prompt?.trim() || undefined
  const image_urls = urls(input.imageUrls)
  const video_urls = urls(input.videoUrls)
  if (!prompt && !image_urls && !video_urls) throw new HiggsfieldProviderError("Seedance 2.0 needs a prompt or a reference image or video.", 400)
  const resolution = String(input.resolution || "720p").toLowerCase()
  const parsed = higgsfieldSeedanceInputSchema.safeParse({
    ...(prompt ? { prompt } : {}),
    duration: Math.min(15, Math.max(4, Math.round(Number(input.duration) || 5))),
    ...(urls(input.audioUrls) ? { audio_urls: urls(input.audioUrls) } : {}),
    ...(image_urls ? { image_urls } : {}),
    ...(video_urls ? { video_urls } : {}),
    resolution: (seedanceResolutions as readonly string[]).includes(resolution) ? resolution : "720p",
    aspect_ratio: (seedanceAspectRatios as readonly string[]).includes(input.aspectRatio || "") ? input.aspectRatio : "16:9",
    generate_audio: input.audioEnabled !== false,
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Seedance 2.0 on Higgsfield could not accept those references.", 400)
  const response = await call(HIGGSFIELD_SEEDANCE_2_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/**
 * Wan needs a prompt; references are optional. It stops at 1080p and has no
 * 21:9, so a 4K request renders at 1080p and a ratio it does not offer is left
 * to "adaptive", which follows the references. Deep thinking, the seed and the
 * document and link inputs are not exposed in the studio and stay at their
 * defaults.
 */
export async function submitHiggsfieldWanVideo(input: {
  prompt: string
  duration?: number
  resolution?: string
  aspectRatio?: string
  imageUrls?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  audioEnabled?: boolean
}) {
  const urls = (values: string[] | undefined, limit?: number) => {
    const list = Array.from(new Set((values || []).filter((value) => /^https?:\/\//i.test(value)))).slice(0, limit)
    return list.length ? list : undefined
  }
  const prompt = input.prompt?.trim()
  if (!prompt) throw new HiggsfieldProviderError("Wan 3.0 Prime needs a prompt.", 400)
  const resolution = String(input.resolution || "1080p").toLowerCase()
  const audio_urls = urls(input.audioUrls, 5)
  const image_urls = urls(input.imageUrls)
  const video_urls = urls(input.videoUrls, 5)
  const parsed = higgsfieldWanInputSchema.safeParse({
    prompt,
    duration: Math.min(30, Math.max(2, Math.round(Number(input.duration) || 5))),
    ...(audio_urls ? { audio_urls } : {}),
    ...(image_urls ? { image_urls } : {}),
    ...(video_urls ? { video_urls } : {}),
    resolution: (wanResolutions as readonly string[]).includes(resolution) ? resolution : "1080p",
    aspect_ratio: (wanAspectRatios as readonly string[]).includes(input.aspectRatio || "") ? input.aspectRatio : "adaptive",
    generate_audio: input.audioEnabled !== false,
    enable_thinking: false,
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Wan 3.0 Prime on Higgsfield could not accept those references.", 400)
  const response = await call(HIGGSFIELD_WAN_3_PRIME_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/**
 * One start image in, one clip out; the clip takes its shape from the image, so
 * there is no ratio or resolution to send. Elements and multi-shot prompts are
 * not exposed in the studio and stay off.
 */
export async function submitHiggsfieldKlingVideo(input: { prompt?: string; duration?: number; imageUrl?: string; lastImageUrl?: string; audioEnabled?: boolean }) {
  const fetchable = (value?: string) => (value && /^https?:\/\//i.test(value) ? value : undefined)
  const image_url = fetchable(input.imageUrl)
  if (!image_url) throw new HiggsfieldProviderError("Kling 3.0 Standard needs a start image. Generate or choose the shot's keyframe first.", 400)
  const prompt = input.prompt?.trim() || undefined
  const last_image_url = fetchable(input.lastImageUrl)
  const parsed = higgsfieldKlingInputSchema.safeParse({
    sound: input.audioEnabled === false ? "off" : "on",
    ...(prompt ? { prompt } : {}),
    duration: Math.min(15, Math.max(3, Math.round(Number(input.duration) || 5))),
    image_url,
    ...(last_image_url && last_image_url !== image_url ? { last_image_url } : {}),
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Kling 3.0 Standard on Higgsfield could not accept that start image.", 400)
  const response = await call(HIGGSFIELD_KLING_3_STD_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/**
 * In key-frame mode the first image is the opening frame; otherwise every image
 * is a reference. The quality tier follows the resolution the shot asks for,
 * since this endpoint has tiers rather than resolutions. Elements and
 * multi-shot prompts are not exposed in the studio and stay off.
 */
export async function submitHiggsfieldKlingO3Video(input: {
  prompt?: string
  duration?: number
  resolution?: string
  aspectRatio?: string
  imageUrls?: string[]
  firstFrameUrl?: string
  lastFrameUrl?: string
  audioEnabled?: boolean
}) {
  const fetchable = (value?: string) => (value && /^https?:\/\//i.test(value) ? value : undefined)
  const first_frame_url = fetchable(input.firstFrameUrl)
  const last_frame_url = fetchable(input.lastFrameUrl)
  const images = Array.from(new Set((input.imageUrls || []).filter((value) => fetchable(value) && value !== first_frame_url && value !== last_frame_url)))
  const prompt = input.prompt?.trim() || undefined
  if (!prompt && !images.length && !first_frame_url) throw new HiggsfieldProviderError("Kling O3 needs a prompt or a reference image.", 400)
  const resolution = String(input.resolution || "").toLowerCase()
  const parsed = higgsfieldKlingO3InputSchema.safeParse({
    mode: resolution === "4k" ? "4k" : resolution === "1080p" ? "pro" : "std",
    sound: input.audioEnabled === false ? "off" : "on",
    ...(prompt ? { prompt } : {}),
    duration: Math.min(15, Math.max(3, Math.round(Number(input.duration) || 5))),
    ...(images.length ? { image_urls: images } : {}),
    ...(["16:9", "9:16", "1:1"].includes(input.aspectRatio || "") ? { aspect_ratio: input.aspectRatio } : {}),
    ...(last_frame_url ? { last_frame_url } : {}),
    ...(first_frame_url ? { first_frame_url } : {}),
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Kling O3 on Higgsfield could not accept those references.", 400)
  const response = await call(HIGGSFIELD_KLING_O3_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/**
 * A prompt and one source clip are both required. The endpoint describes a
 * single reference video, so only the first clip is sent. It has two quality
 * tiers and no sound setting.
 */
export async function submitHiggsfieldKlingO3VideoReference(input: { prompt: string; duration?: number; resolution?: string; aspectRatio?: string; imageUrls?: string[]; videoUrls?: string[] }) {
  const fetchable = (values?: string[]) => Array.from(new Set((values || []).filter((value) => /^https?:\/\//i.test(value))))
  const prompt = input.prompt?.trim()
  if (!prompt) throw new HiggsfieldProviderError("Kling O3 Video Reference needs a prompt.", 400)
  const videos = fetchable(input.videoUrls).slice(0, 1)
  if (!videos.length) throw new HiggsfieldProviderError("Kling O3 Video Reference needs a source video. Add a motion reference to this shot.", 400)
  const images = fetchable(input.imageUrls)
  const resolution = String(input.resolution || "").toLowerCase()
  const parsed = higgsfieldKlingO3VideoInputSchema.safeParse({
    mode: resolution === "480p" || resolution === "720p" ? "std" : "pro",
    prompt,
    duration: Math.min(10, Math.max(3, Math.round(Number(input.duration) || 5))),
    ...(images.length ? { image_urls: images } : {}),
    video_urls: videos,
    ...(["16:9", "9:16", "1:1"].includes(input.aspectRatio || "") ? { aspect_ratio: input.aspectRatio } : {}),
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Kling O3 Video Reference on Higgsfield could not accept those references.", 400)
  const response = await call(HIGGSFIELD_KLING_O3_VIDEO_PATH, parsed.data)
  if (typeof response.request_id !== "string" || !response.request_id) throw new HiggsfieldProviderError("Higgsfield did not return a request ID")
  return { id: response.request_id, response }
}

/** It renders at 480p or 720p, so anything higher is asked for at 720p. */
export async function submitHiggsfieldCinemaStudioVideo(input: { prompt: string; duration?: number; resolution?: string; aspectRatio?: string; imageUrls?: string[]; audioEnabled?: boolean }) {
  const prompt = input.prompt?.trim()
  if (!prompt) throw new HiggsfieldProviderError("Cinema Studio 4.0 needs a prompt.", 400)
  const images = Array.from(new Set((input.imageUrls || []).filter((value) => /^https?:\/\//i.test(value)))).slice(0, 30)
  const parsed = higgsfieldCinemaStudioInputSchema.safeParse({
    prompt,
    duration: Math.min(30, Math.max(4, Math.round(Number(input.duration) || 5))),
    resolution: String(input.resolution || "").toLowerCase() === "480p" ? "480p" : "720p",
    ...((seedanceAspectRatios as readonly string[]).includes(input.aspectRatio || "") ? { aspect_ratio: input.aspectRatio } : {}),
    generate_audio: input.audioEnabled !== false,
    ...(images.length ? { image_urls: images } : {}),
  })
  if (!parsed.success) throw new HiggsfieldProviderError("Cinema Studio 4.0 could not accept those references.", 400)
  const response = await call(HIGGSFIELD_CINEMA_STUDIO_4_MODEL, parsed.data)
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
  input = { ...input, prompt: prepareImageModelPrompt(input.prompt, model) }
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
