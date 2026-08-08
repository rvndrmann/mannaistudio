import { GoogleGenAI } from "@google/genai"
import type { ImageGenerationModelId, VideoGenerationModelId } from "@/lib/studio/generation-models"

export class GoogleProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "GoogleProviderError"
  }
}

function getGoogleApiKey() {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new GoogleProviderError("Google AI Studio API key is not configured. Add GOOGLE_AI_STUDIO_API_KEY to the server environment.", 503)
  return key
}

export async function generateGoogleImage(input: {
  model: ImageGenerationModelId
  prompt: string
  referenceUrls?: string[]
}) {
  const apiKey = getGoogleApiKey()
  const ai = new GoogleGenAI({ apiKey })

  const modelId = input.model === "google-nano-banana-2" ? "imagen-3.0-generate-002" : "imagen-3.0-generate-002"

  try {
    const response = await ai.models.generateImages({
      model: modelId,
      prompt: input.prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio: "1:1",
      },
    })

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes
    if (!imageBytes) throw new GoogleProviderError("Google AI Studio did not return an image.")

    const url = `data:image/png;base64,${imageBytes}`
    return { url, contentType: "image/png" }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Google image generation failed"
    throw new GoogleProviderError(`Google AI Studio request failed: ${msg}`)
  }
}

export async function submitGoogleVideo(input: {
  model: VideoGenerationModelId
  prompt: string
  duration?: number
  resolution?: string
  ratio?: string
  referenceUrls?: string[]
}) {
  const apiKey = getGoogleApiKey()
  const ai = new GoogleGenAI({ apiKey })

  const modelId = input.model === "google-veo-3-1" ? "veo-3.1-generate-preview" : "veo-2.0-generate-001"

  try {
    const response = await ai.models.generateVideos({
      model: modelId,
      prompt: input.prompt,
      config: {
        aspectRatio: input.ratio === "16:9" ? "16:9" : "9:16",
        resolution: input.resolution === "1080p" ? "1080p" : "720p",
        durationSeconds: Math.min(10, Math.max(4, Math.round(input.duration || 4))),
      },
    })

    const name = (response as { name?: string }).name || `operations/${Date.now()}`
    return { id: name, response }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Google Veo video submission failed"
    throw new GoogleProviderError(`Google AI Studio request failed: ${msg}`)
  }
}

export async function getGoogleVideoTask(taskId: string) {
  const apiKey = getGoogleApiKey()

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${taskId}?key=${apiKey}`)
    const operation = (await res.json()) as Record<string, unknown>

    if (operation.error) {
      const errObj = operation.error as { message?: string }
      return {
        id: taskId,
        status: "failed" as const,
        content: undefined,
        error: { message: errObj.message || "Google Veo generation failed" },
      }
    }

    const isDone = Boolean(operation.done)

    if (isDone) {
      const response = operation.response as Record<string, unknown> | undefined
      const genResponse = (response?.generateVideoResponse || response) as Record<string, unknown> | undefined
      const samples = (genResponse?.generatedSamples || genResponse?.generatedVideos) as Array<{ video?: { uri?: string } }> | undefined
      let videoUri = samples?.[0]?.video?.uri

      if (videoUri && !videoUri.includes("key=")) {
        videoUri = `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${apiKey}`
      }

      return {
        id: taskId,
        status: "succeeded" as const,
        content: { video_url: videoUri },
        error: undefined,
      }
    }

    return {
      id: taskId,
      status: "running" as const,
      content: undefined,
      error: undefined,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch Google Veo task status"
    throw new GoogleProviderError(msg)
  }
}
