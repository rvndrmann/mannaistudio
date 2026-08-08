export const imageGenerationModels = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai" },
  { id: "dola-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro", provider: "byteplus" },
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
  { id: "google-gemini-2-5-pro", label: "Gemini 2.5 Pro (Google AI Studio)", provider: "google" },
  { id: "google-omni-flash", label: "Omni Flash (Google AI Studio)", provider: "google" },
  { id: "dreamina-seedance-2-5-260628", label: "Seedance 2.5 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-260128", label: "Seedance 2.0 (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast (BytePlus Direct)", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini (BytePlus Direct)", provider: "byteplus" },
  { id: "fal-kling-3", label: "Kling 3 (fal.ai)", provider: "fal" },
  { id: "fal-kling-o3", label: "Kling O3 (fal.ai)", provider: "fal" },
  { id: "fal-kling-1-6-pro", label: "Kling 1.6 Pro (fal.ai)", provider: "fal" },
  { id: "fal-minimax-h3", label: "MiniMax H3 (fal.ai)", provider: "fal" },
  { id: "fal-minimax-video-01", label: "MiniMax Video-01 (fal.ai)", provider: "fal" },
  { id: "fal-hunyuan-video", label: "Hunyuan Video (fal.ai)", provider: "fal" },
  { id: "fal-luma-dream-machine", label: "Luma Dream Machine (fal.ai)", provider: "fal" },
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
