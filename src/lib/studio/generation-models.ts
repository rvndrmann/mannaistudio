export const imageGenerationModels = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai" },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", provider: "openai" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai" },
  { id: "dola-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro", provider: "byteplus" },
  { id: "google-nano-banana-2-pro", label: "Gemini 3 Pro Image / Nano Banana Pro (Google AI Studio)", provider: "google" },
  { id: "google-nano-banana-2", label: "Nano Banana 2 (Google AI Studio)", provider: "google" },
  { id: "google-nano-banana-2-1", label: "Gemini 3.1 Flash Image / Nano Banana 2.1 (Google AI Studio)", provider: "google" },
  { id: "google-nano-banana-2-lite", label: "Gemini 3.1 Flash Lite Image / Nano Banana 2 Lite (Google AI Studio)", provider: "google" },
  { id: "fal-gpt-image-2-5-sunburst", label: "GPT Image 2.5 Sunburst (fal.ai)", provider: "fal" },
  { id: "fal-gpt-image-2-5-sunburst-edit", label: "GPT Image 2.5 Sunburst Edit (fal.ai)", provider: "fal" },
  { id: "fal-flux-3", label: "Flux 3 (fal.ai)", provider: "fal" },
  { id: "fal-flux-dev", label: "Flux Dev (fal.ai)", provider: "fal" },
  { id: "fal-flux-realism", label: "Flux Realism (fal.ai)", provider: "fal" },
  { id: "higgsfield-ai/soul/v2/standard", label: "Soul V2 Standard (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield-ai/soul/v2/image-to-image", label: "Soul V2 Image-to-Image (Higgsfield)", provider: "higgsfield" },
] as const

export const videoGenerationModels = [
  { id: "fal-seedance-2-5", label: "Seedance 2.5", provider: "fal" },
  { id: "fal-seedance-2-0", label: "Seedance 2.0", provider: "fal" },
  { id: "fal-seedance-2-0-fast", label: "Seedance 2.0 Fast", provider: "fal" },
  { id: "fal-seedance-2-0-mini", label: "Seedance 2.0 Mini", provider: "fal" },
  { id: "google-veo-3-1", label: "Veo 3.1 (Google AI Studio)", provider: "google" },
  { id: "google-veo-3-1-fast", label: "Veo 3.1 Fast (Google AI Studio)", provider: "google" },
  { id: "google-veo-3-1-lite", label: "Veo 3.1 Lite (Google AI Studio)", provider: "google" },
  { id: "google-omni-flash", label: "Gemini Omni Flash (Google AI Studio)", provider: "google" },
  { id: "google-omni-1-1-flash", label: "Gemini Omni 1.1 Flash (Google AI Studio)", provider: "google" },
  { id: "dreamina-seedance-2-5-260628", label: "Seedance 2.5 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-260128", label: "Seedance 2.0 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini (BytePlus Direct)", provider: "byteplus" },
  { id: "fal-kling-3", label: "Kling 3.0 (fal.ai)", provider: "fal" },
  { id: "fal-kling-o3", label: "Kling O3 (fal.ai)", provider: "fal" },
  { id: "fal-kling-1-6-pro", label: "Kling 1.6 Pro (fal.ai)", provider: "fal" },
  { id: "fal-minimax-h3", label: "MiniMax H3 (fal.ai)", provider: "fal" },
  { id: "fal-minimax-video-01", label: "MiniMax Video-01 (fal.ai)", provider: "fal" },
  { id: "higgsfield/cinema-studio/4.0", label: "Cinema Studio 4.0 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/bytedance/seedance-2.0/reference-to-video", label: "Seedance 2.0 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/alibaba/wan-3.0-prime/reference-to-video", label: "Wan 3.0 Prime (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/v3.0/std/image-to-video", label: "Kling 3.0 Standard (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/o3/image-reference", label: "Kling O3 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/o3/video-reference", label: "Kling O3 Video Reference (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/minimax/h3/text-to-video", label: "MiniMax H3 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/genjutsu/motion-transfer/v1.0", label: "Genjutsu Motion Transfer (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/genjutsu/object-swap/v1.0", label: "Genjutsu Object Swap (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/genjutsu/restyle/v1.0", label: "Genjutsu Restyle (Higgsfield)", provider: "higgsfield" },
] as const

export type ImageGenerationModelId = (typeof imageGenerationModels)[number]["id"]
export type VideoGenerationModelId = (typeof videoGenerationModels)[number]["id"]

export function isImageGenerationModel(value: unknown): value is ImageGenerationModelId {
  return typeof value === "string" && imageGenerationModels.some((model) => model.id === value)
}

export function isVideoGenerationModel(value: unknown): value is VideoGenerationModelId {
  return typeof value === "string" && videoGenerationModels.some((model) => model.id === value)
}

/**
 * Whether this image model can only edit a picture it is given.
 *
 * An edit model with nothing to edit is refused by the provider, so a caller
 * that has a picture to hand should send it rather than let the render fail.
 */
export function imageModelRequiresReference(model: string): boolean {
  return model === "fal-gpt-image-2-5-sunburst-edit" || model === "higgsfield-ai/soul/v2/image-to-image"
}

/** Genjutsu re-renders a source clip; it cannot start from text or a still. */
export const isGenjutsuVideoModel = (model: string) => model.startsWith("higgsfield/genjutsu/")

/** Video models that re-render a source clip and cannot run without one. */
export const videoModelNeedsSourceVideo = (model: string) => isGenjutsuVideoModel(model) || model === "higgsfield/kling-video/o3/video-reference"

/** Video models whose endpoint accepts a prompt and nothing else. */
export const isTextOnlyVideoModel = (model: string) => model === "higgsfield/minimax/h3/text-to-video"

/** Video models that animate one start image and cannot begin from text alone. */
export const isImageOnlyVideoModel = (model: string) => model === "higgsfield/kling-video/v3.0/std/image-to-video"

/** Higgsfield models whose endpoint takes audio files as references. */
export const higgsfieldTakesAudioReferences = (model: string) =>
  model === "higgsfield/bytedance/seedance-2.0/reference-to-video" || model === "higgsfield/alibaba/wan-3.0-prime/reference-to-video" || model === "higgsfield/cinema-studio/4.0"

export function generationProvider(model: ImageGenerationModelId | VideoGenerationModelId) {
  if (model.startsWith("higgsfield/") || model.startsWith("higgsfield-ai/")) return "higgsfield"
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
  if (model === "higgsfield/kling-video/o3/video-reference") return 10
  return model.startsWith("higgsfield/genjutsu/") || model.startsWith("higgsfield/alibaba/wan-3.0-prime/") || model === "higgsfield/cinema-studio/4.0" || /seedance-2[-.]5/i.test(model) ? 30 : 15
}

/** Duration choices to offer for a model, never exceeding what it can render. */
export function videoDurationOptions(model: string) {
  const max = videoModelMaxDuration(model)
  // Higgsfield's MiniMax H3 endpoint starts at five seconds.
  const min = isTextOnlyVideoModel(model) ? 5 : 0
  return [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].filter((seconds) => seconds >= min && seconds <= max)
}
