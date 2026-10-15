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
  { id: "higgsfield/ai-influencer", label: "AI Influencer Character Sheet (Higgsfield)", provider: "higgsfield" },
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
  { id: "higgsfield/bytedance/seedance-2.5/reference-to-video", label: "Seedance 2.5 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/bytedance/seedance-2.0/reference-to-video", label: "Seedance 2.0 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/alibaba/wan-3.0-prime/reference-to-video", label: "Wan 3.0 Prime (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/v3.0/std/image-to-video", label: "Kling 3.0 Standard (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/o3/image-reference", label: "Kling O3 (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/kling-video/o3/video-reference", label: "Kling O3 Video Reference (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/minimax/h3/text-to-video", label: "MiniMax H3 Text (Higgsfield)", provider: "higgsfield" },
  { id: "higgsfield/minimax/h3/reference-to-video", label: "MiniMax H3 Reference (Higgsfield)", provider: "higgsfield" },
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

/**
 * Image models that always return a character reference sheet.
 *
 * A sheet is a portrait beside a full-body view on a fixed 16:9 canvas, so it
 * is never the right answer for a storyboard frame or a scene. Such a model is
 * used only when somebody picks it; it is never a project default and never
 * something routing falls back to.
 */
export const isCharacterSheetImageModel = (model: string) => model === "higgsfield/ai-influencer"

/** The character types AI Influencer draws. The id is what the API takes; the label is what its playground shows. */
export const aiInfluencerTiers = [
  { id: "normal", label: "Average" },
  { id: "freak", label: "Bold" },
  { id: "total", label: "Extreme" },
  { id: "insects", label: "Insect" },
  { id: "frogs", label: "Frog" },
  { id: "cats", label: "Cat" },
  { id: "dogs", label: "Dog" },
  { id: "capybaras", label: "Rodent" },
  { id: "birds", label: "Bird" },
] as const
export type AiInfluencerTier = (typeof aiInfluencerTiers)[number]["id"]
export const aiInfluencerTierIds = aiInfluencerTiers.map((tier) => tier.id) as [AiInfluencerTier, ...AiInfluencerTier[]]
export const isAiInfluencerTier = (value: unknown): value is AiInfluencerTier => (aiInfluencerTierIds as readonly unknown[]).includes(value)

/** Image models to offer as a project-wide default. */
export const projectDefaultImageModels = imageGenerationModels.filter((model) => !isCharacterSheetImageModel(model.id))

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
  model === "higgsfield/bytedance/seedance-2.0/reference-to-video" || model === "higgsfield/bytedance/seedance-2.5/reference-to-video" || model === "higgsfield/alibaba/wan-3.0-prime/reference-to-video" || model === "higgsfield/cinema-studio/4.0" || model === "higgsfield/minimax/h3/reference-to-video"

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
 * The resolutions a video model renders, lowest first.
 *
 * From the providers' own references. BytePlus lists, for its Seedance models:
 * 2.5 at 480p, 720p and 1080p; 2.0 at those and 4k; 2.0 fast and mini at 480p
 * and 720p only. fal's Seedance endpoints follow the same split, Veo renders
 * 720p or 1080p, and Cinema Studio 4.0 480p or 720p. A model not named here
 * keeps the full list it was always offered, since nothing says otherwise.
 */
export function videoResolutionOptions(model: string): string[] {
  if (/seedance-2[-.]0-(fast|mini)/i.test(model)) return ["480p", "720p"]
  if (/seedance-2[-.]5/i.test(model)) return ["480p", "720p", "1080p"]
  if (/^google-veo-/.test(model)) return ["720p", "1080p"]
  if (model === "higgsfield/cinema-studio/4.0") return ["480p", "720p"]
  if (model.startsWith("higgsfield/genjutsu/")) return ["480p", "720p", "1080p"]
  return ["480p", "720p", "1080p", "4K"]
}

/** The resolution a model renders that is closest to, and not above, the one asked for. */
export function nearestVideoResolution(model: string, resolution?: string | null) {
  const options = videoResolutionOptions(model)
  const wanted = options.findIndex((option) => option.toLowerCase() === String(resolution || "720p").toLowerCase())
  if (wanted >= 0) return options[wanted]
  const order = ["480p", "720p", "1080p", "4k"]
  const asked = order.indexOf(String(resolution || "720p").toLowerCase())
  const below = options.filter((option) => order.indexOf(option.toLowerCase()) <= asked)
  return below[below.length - 1] || options[0]
}

/** The lengths the picker steps through, before a model narrows them. */
const DURATION_STEPS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30]

/**
 * The clip lengths a video model will actually render, in seconds.
 *
 * Read from each provider's own schema rather than assumed, because they do not
 * agree and a length outside the list is never an honest failure: Veo and
 * Kling 1.6 reject it, and Seedance quietly renders something shorter while the
 * user is charged for what they picked.
 *
 *   Veo 3.1 (all three)        4, 6 or 8 — and only 8 at 1080p
 *   Kling 1.6 Pro on fal       5 or 10
 *   MiniMax Video-01 on fal    no length input; it renders six seconds
 *   MiniMax H3                 5 to 15
 *   Kling O3 Video Reference   up to 10
 *   Seedance 2.5, Wan 3.0 Prime, Cinema Studio 4.0, Genjutsu   up to 30
 *   everything else            up to 15
 *
 * Nothing is offered under four seconds: the submission refuses it whichever
 * model is asked.
 */
/** Models that render only the lengths listed for them, not any second between. */
const rendersFixedLengths = (model: string) => /^google-veo-/.test(model) || model === "fal-kling-1-6-pro" || model === "fal-minimax-video-01"

export function videoDurationOptions(model: string, resolution?: string) {
  if (/^google-veo-/.test(model)) return /^(1080p|4k)$/i.test(resolution || "") ? [8] : [4, 6, 8]
  if (model === "fal-kling-1-6-pro") return [5, 10]
  if (model === "fal-minimax-video-01") return [6]
  const min = /minimax\/h3\//.test(model) || model === "fal-minimax-h3" ? 5 : 4
  const max = model === "higgsfield/kling-video/o3/video-reference"
    ? 10
    : model.startsWith("higgsfield/genjutsu/") || model.startsWith("higgsfield/alibaba/wan-3.0-prime/") || model === "higgsfield/cinema-studio/4.0" || /seedance-2[-.]5/i.test(model) ? 30 : 15
  return DURATION_STEPS.filter((seconds) => seconds >= min && seconds <= max)
}

/** Longest clip a video model will produce, in seconds. */
export function videoModelMaxDuration(model: string) {
  return Math.max(...videoDurationOptions(model))
}

/**
 * The length a model will render that is closest to the one asked for.
 *
 * A tie goes to the longer clip: a line of dialogue cut short is worse than a
 * beat held a second longer. A whole number between two offered steps is left
 * alone when the model takes any second in its range, so a nine-second shot
 * stays nine seconds on Seedance and becomes eight on Veo.
 */
export function nearestVideoDuration(model: string, seconds: number, resolution?: string) {
  const options = videoDurationOptions(model, resolution)
  const wanted = Math.round(Number(seconds) || options[0])
  if (!rendersFixedLengths(model) && wanted >= options[0] && wanted <= options[options.length - 1]) return wanted
  return options.reduce((best, option) => Math.abs(option - wanted) <= Math.abs(best - wanted) ? option : best, options[0])
}
