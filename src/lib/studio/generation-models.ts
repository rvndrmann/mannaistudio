export const imageGenerationModels = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai" },
  { id: "dola-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro", provider: "byteplus" },
] as const

export const videoGenerationModels = [
  { id: "dreamina-seedance-2-5-260628", label: "Seedance 2.5", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-260128", label: "Seedance 2.0", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast", provider: "byteplus" },
  { id: "dreamina-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini", provider: "byteplus" },
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
  return model.startsWith("dreamina-") || model.startsWith("dola-") ? "byteplus" : "openai"
}
