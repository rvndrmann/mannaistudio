export const imageGenerationModels = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai" },
  { id: "dola-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro", provider: "byteplus" },
  { id: "google-nano-banana-2-pro", label: "Nano Banana 2 Pro (Google AI Studio)", provider: "google" },
  { id: "google-nano-banana-2", label: "Nano Banana 2 (Google AI Studio)", provider: "google" },
  { id: "fal-flux-3", label: "Flux 3 (fal.ai)", provider: "fal" },
  { id: "fal-flux-dev", label: "Flux Dev (fal.ai)", provider: "fal" },
  { id: "fal-flux-realism", label: "Flux Realism (fal.ai)", provider: "fal" },
] as const

export const videoGenerationModels = [
  { id: "fal-seedance-2-5", label: "Seedance 2.5", provider: "fal" },
  { id: "fal-seedance-2-0", label: "Seedance 2.0", provider: "fal" },
  { id: "fal-seedance-2-0-fast", label: "Seedance 2.0 Fast", provider: "fal" },
  { id: "fal-seedance-2-0-mini", label: "Seedance 2.0 Mini", provider: "fal" },
  { id: "google-veo-3-1", label: "Veo 3.1 (Google AI Studio)", provider: "google" },
  { id: "dreamina-seedance-2-5-260628", label: "Seedance 2.5 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-260128", label: "Seedance 2.0 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini (BytePlus Direct)", provider: "byteplus" },
  { id: "fal-kling-3", label: "Kling 3.0 (fal.ai)", provider: "fal" },
  { id: "fal-kling-o3", label: "Kling O3 (fal.ai)", provider: "fal" },
  { id: "fal-kling-1-6-pro", label: "Kling 1.6 Pro (fal.ai)", provider: "fal" },
  { id: "fal-minimax-h3", label: "MiniMax H3 (fal.ai)", provider: "fal" },
  { id: "fal-minimax-video-01", label: "MiniMax Video-01 (fal.ai)", provider: "fal" },
] as const

export type ImageGenerationModelId = (typeof imageGenerationModels)[number]["id"]
export type VideoGenerationModelId = (typeof videoGenerationModels)[number]["id"]

export function isImageGenerationModel(value: unknown): value is ImageGenerationModelId {
  return typeof value === "string" && imageGenerationModels.some((model) => model.id === value)
}

export function isVideoGenerationModel(value: unknown): value is VideoGenerationModelId {
  return typeof value === "string" && videoGenerationModels.some((model) => model.id === value)
}

export function generationProvider(model: ImageGenerationModelId | VideoGenerationModelId) {
  if (model.startsWith("google-")) return "google"
  if (model.startsWith("fal-")) return "fal"
  return model.startsWith("dreamina-") || model.startsWith("dola-") ? "byteplus" : "openai"
}

export const defaultDirectorVideoModel: VideoGenerationModelId = "dreamina-seedance-2-5-260628"

/**
 * AI Director generation currently executes through the BytePlus background
 * worker. Respect a saved BytePlus choice, but never let an absent or legacy
 * fal selection silently become the approval card's model.
 */
export function projectDirectorVideoModel(project: Record<string, unknown>): VideoGenerationModelId {
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const settings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const configured = typeof settings.videoModel === "string" ? settings.videoModel : ""
  const supported = videoGenerationModels.find((model) => model.id === configured)
  return supported?.id || defaultDirectorVideoModel
}

/**
 * A video model that is still offered.
 *
 * A model retired from the list stays saved in the projects that chose it, and
 * nothing downstream notices: pricing falls back to a flat default, the picker
 * shows a raw id, and fal.ts renders on whatever its switch defaults to. So a
 * stored id no longer on the list resolves here to one that is.
 */
export function supportedVideoModel(value: unknown): VideoGenerationModelId {
  return isVideoGenerationModel(value) ? value : videoGenerationModels[0].id
}

export function getModelLabel(modelId: string) {
  if (!modelId) return "Default Model"
  const found = [...imageGenerationModels, ...videoGenerationModels].find((m) => m.id === modelId)
  return found ? found.label : modelId
}

/**
 * Longest clip a video model will produce, in seconds.
 *
 * Seedance 2.5 takes 30; 2.0 and its fast and mini variants stop at 15. Asking
 * for more does not fail — the provider silently truncates — so the limit has
 * to be applied before the request is priced or sent, or the user is charged
 * for seconds they never receive.
 */
export function videoModelMaxDuration(model: string) {
  return /seedance-2[-.]5/i.test(model) ? 30 : 15
}

/** Duration choices to offer for a model, never exceeding what it can render. */
export function videoDurationOptions(model: string) {
  const max = videoModelMaxDuration(model)
  return [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].filter((seconds) => seconds <= max)
}
