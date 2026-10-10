import { composeImagePrompt, prepareImageModelPrompt } from "./image-prompt-composition"
import "server-only"
import { generateGoogleImage } from "./google"
import { generateOpenAIImage, openAIImageModels, type OpenAIImageModel, type OpenAIImageQuality } from "./openai"
import { generationProvider, type ImageGenerationModelId } from "./generation-models"

export type GeneratedImage = {
  buffer: Buffer
  contentType: string
  provider: string
  model: ImageGenerationModelId
}

/**
 * Renders an image on whichever provider owns the chosen model.
 *
 * Both providers are normalised to bytes here so callers store and sign the
 * result identically — Google hands back a data URL and OpenAI a buffer, and
 * leaving that difference to each call site is how one of them ends up
 * supporting a single provider by accident.
 */
export async function generateProjectImage(input: {
  userId: string
  model: ImageGenerationModelId
  prompt: string
  referenceUrls?: string[]
  aspectRatio?: string
  quality?: OpenAIImageQuality
}): Promise<GeneratedImage> {
  input = { ...input, prompt: prepareImageModelPrompt(composeImagePrompt({ prompt: input.prompt, aspectRatio: input.aspectRatio }), input.model) }
  const provider = generationProvider(input.model)

  if (provider === "google") {
    const image = await generateGoogleImage({
      model: input.model,
      prompt: input.prompt,
      referenceUrls: input.referenceUrls,
    })
    const base64 = image.url.split(",")[1] || ""
    return {
      buffer: Buffer.from(base64, "base64"),
      contentType: image.contentType || "image/png",
      provider,
      model: input.model,
    }
  }

  // Everything else renders on OpenAI. A model from another provider that has
  // no image path here would otherwise be sent to OpenAI under its own name and
  // rejected, so it falls back to the default GPT Image model instead.
  const openAIModel: OpenAIImageModel = openAIImageModels.includes(input.model as OpenAIImageModel)
    ? input.model as OpenAIImageModel
    : "gpt-image-2"
  const buffer = await generateOpenAIImage({
    userId: input.userId,
    model: openAIModel,
    prompt: input.prompt,
    referenceUrls: input.referenceUrls,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
  })
  return { buffer, contentType: "image/png", provider: "openai", model: input.model }
}
