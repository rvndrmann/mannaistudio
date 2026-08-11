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

import type { OpenAIDirectorFunction, OpenAIDirectorToolCall } from "@/lib/studio/openai"

export async function createGoogleDirectorToolTurn(input: {
  userId: string
  model: string
  instructions: string
  items: Array<Record<string, unknown>>
  tools: OpenAIDirectorFunction[]
}): Promise<{
  id: string
  content: string
  calls: OpenAIDirectorToolCall[]
  usage: Record<string, unknown>
}> {
  const apiKey = getGoogleApiKey()
  const ai = new GoogleGenAI({ apiKey })

  const functionDeclarations = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))

  const contents = input.items.map((item) => {
    if (item.role === "user") {
      return { role: "user", parts: [{ text: String(item.content || "") }] }
    }
    if (item.role === "assistant") {
      const parts: Array<Record<string, unknown>> = []
      if (item.content) parts.push({ text: String(item.content) })
      return { role: "model", parts: parts.length ? parts : [{ text: "..." }] }
    }
    if (item.type === "function_call") {
      return {
        role: "model",
        parts: [{
          functionCall: {
            name: String(item.name),
            args: (typeof item.arguments === "string" ? JSON.parse(item.arguments) : (item.arguments || {})) as Record<string, unknown>,
          },
        }],
      }
    }
    if (item.type === "function_call_output") {
      return {
        role: "user",
        parts: [{
          functionResponse: {
            name: String(item.name || "function"),
            response: (typeof item.output === "string" ? JSON.parse(item.output) : (item.output || {})) as Record<string, unknown>,
          },
        }],
      }
    }
    return { role: "user", parts: [{ text: String(item.content || "") }] }
  })

  const modelId = input.model.startsWith("gemini") ? input.model : "gemini-2.5-flash"

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents as any,
      config: {
        systemInstruction: input.instructions,
        tools: functionDeclarations.length ? [{ functionDeclarations: functionDeclarations as any }] : undefined,
      },
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []

    let content = ""
    const calls: OpenAIDirectorToolCall[] = []

    for (const part of parts) {
      if (part.text) {
        content += (content ? "\n" : "") + part.text
      }
      if (part.functionCall?.name) {
        calls.push({
          callId: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        })
      }
    }

    const usage = {
      input_tokens: response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0,
    }

    return {
      id: `resp_google_${Date.now()}`,
      content: content.trim(),
      calls,
      usage,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Google LLM chat failed"
    throw new GoogleProviderError(`Google Gemini request failed: ${msg}`)
  }
}
