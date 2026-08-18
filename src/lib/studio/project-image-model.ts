import { generateGoogleImage } from "./google"
import { generateOpenAIImage, type OpenAIImageModel, type OpenAIImageQuality } from "./openai"
import { generationProvider, imageGenerationModels, isImageGenerationModel, type ImageGenerationModelId } from "./generation-models"

/**
 * The image model a project actually asked for.
 *
 * The Director generated every keyframe and every piece of character art on
 * gpt-image-2, hardcoded, so a project set to Nano Banana still got GPT Image —
 * the setting only reached the manual storyboard buttons. These read the same
 * Basic Settings the picker writes, so the agent and the buttons agree.
 */
function basicSettings(project: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  return metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
}

function pick(value: unknown): ImageGenerationModelId | null {
  return typeof value === "string" && isImageGenerationModel(value) ? value : null
}

/** Keyframes and shot continuity. */
export function projectStoryboardImageModel(project: Record<string, unknown> | null | undefined): ImageGenerationModelId {
  const settings = basicSettings(project)
  return pick(settings.storyboardImageModel) || pick(settings.imageModel) || imageGenerationModels[0].id
}

/** Character, prop, and location reference art. */
export function projectCharacterImageModel(project: Record<string, unknown> | null | undefined): ImageGenerationModelId {
  const settings = basicSettings(project)
  return pick(settings.characterImageModel) || projectStoryboardImageModel(project)
}

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
  const openAIModel: OpenAIImageModel = input.model === "gpt-image-1.5" ? "gpt-image-1.5" : "gpt-image-2"
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
