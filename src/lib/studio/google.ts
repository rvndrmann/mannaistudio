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

  const modelId = input.model === "google-nano-banana-2-pro"
    ? "gemini-3-pro-image-preview"
    : "gemini-2.5-flash-image"

  const referenceParts = await Promise.all((input.referenceUrls || []).slice(0, 3).map(async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new GoogleProviderError(`Could not download Google image reference (${response.status}).`)
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png"
    const data = Buffer.from(await response.arrayBuffer()).toString("base64")
    return { inlineData: { mimeType, data } }
  }))

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{
        role: "user",
        parts: [
          { text: input.prompt },
          ...referenceParts,
        ],
      }],
      config: {
        responseModalities: ["IMAGE"],
      },
    })

    const imageBytes = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data
    if (!imageBytes) throw new GoogleProviderError("Google AI Studio did not return an image.")

    const mimeType = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.mimeType || "image/png"
    const url = `data:${mimeType};base64,${imageBytes}`
    return { url, contentType: mimeType }
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
  if (input.model === "google-omni-flash") {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-omni-flash-preview",
          input: input.prompt,
          ...(input.referenceUrls?.length ? { context: input.referenceUrls.slice(0, 3) } : {}),
        }),
      })
      const data = await response.json() as { id?: string; error?: { message?: string } }
      if (!response.ok || !data.id) throw new GoogleProviderError(data.error?.message || "Google Omni Flash did not return an interaction.")
      return { id: data.id, response: data }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Google Omni Flash submission failed"
      throw new GoogleProviderError(`Google AI Studio request failed: ${msg}`)
    }
  }
  const ai = new GoogleGenAI({ apiKey })

  const modelId = "veo-3.1-generate-preview"

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
    if (taskId.startsWith("v1_")) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${taskId}?key=${apiKey}`)
      const interaction = await res.json() as Record<string, unknown>
      if (interaction.error) return { id: taskId, status: "failed" as const, content: undefined, error: { message: String((interaction.error as { message?: string }).message || "Google Omni Flash failed") } }
      if (interaction.status !== "completed") return { id: taskId, status: "running" as const, content: undefined, error: undefined }
      const outputs = Array.isArray(interaction.outputs) ? interaction.outputs as Array<Record<string, unknown>> : []
      const video = outputs.find((output) => typeof output.video_url === "string" || typeof output.url === "string")
      return { id: taskId, status: "succeeded" as const, content: { video_url: String(video?.video_url || video?.url || "") }, error: undefined }
    }
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

      // A finished operation with no video is a refusal, not a success. Veo
      // reports its safety filtering this way, and returning "succeeded" with
      // an empty url left the job processing for ever and the shot spinning —
      // the user never learned their prompt had been rejected.
      if (!videoUri) {
        const reasons = genResponse?.raiMediaFilteredReasons
        const filtered = Array.isArray(reasons) && reasons.length ? String(reasons[0]) : ""
        return {
          id: taskId,
          status: "failed" as const,
          content: undefined,
          error: { message: filtered || "Google finished this request without returning a video." },
        }
      }

      if (!videoUri.includes("key=")) {
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

function readThoughtSignature(item: Record<string, unknown>): string | undefined {
  const value = (item as { thoughtSignature?: unknown; thought_signature?: unknown }).thoughtSignature
    ?? (item as { thought_signature?: unknown }).thought_signature
  return typeof value === "string" && value.length > 0 ? value : undefined
}

// functionCall.args and functionResponse.response must both be JSON objects.
// Tool payloads arrive as JSON strings and can decode to arrays or primitives,
// so anything that is not a plain object is wrapped instead of sent as-is.
function asJsonObject(value: unknown): Record<string, unknown> {
  const unwrap = (candidate: unknown): Record<string, unknown> =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : candidate === undefined || candidate === null
      ? {}
      : { result: candidate }
  if (typeof value !== "string") return unwrap(value)
  try {
    return unwrap(JSON.parse(value))
  } catch {
    return { result: value }
  }
}

const DATA_URL = /^data:([^;,]+);base64,(.+)$/i

/**
 * Maps a Responses-API user turn onto Gemini parts.
 *
 * A turn carrying images is an array of content parts, not a string. Coercing
 * that array with String() produced "[object Object]", so a Gemini run silently
 * lost every reference picture it was sent and answered about images it could
 * not see.
 */
function textAndImageParts(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [{ text: String(content || "") }]
  const parts: Array<Record<string, unknown>> = []
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue
    const part = entry as Record<string, unknown>
    if (part.type === "input_text" || part.type === "text") {
      const text = String(part.text || "")
      if (text) parts.push({ text })
      continue
    }
    if (part.type === "input_image") {
      const url = String(part.image_url || "")
      const inlined = DATA_URL.exec(url)
      // Gemini takes bytes inline; a remote URL it would have to fetch itself
      // is skipped rather than sent as a link it cannot open.
      if (inlined) parts.push({ inlineData: { mimeType: inlined[1], data: inlined[2] } })
    }
  }
  return parts.length ? parts : [{ text: "" }]
}

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

  // Gemini 2.x never emits thought signatures; only the 3.x reasoning models
  // require the replayed signature and reject a turn that omits it.
  const requireSignature = input.model.includes("gemini-3") || input.model.includes("gemini-exp")
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []

  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index]

    if (item.type === "function_call" || item.type === "function_call_output") {
      // Gemini expects every parallel call of one model turn in a single model
      // content followed by all of their responses in one user content. The
      // Director emits one batch as calls-then-outputs, so a call that follows
      // an output starts the next sequential step and closes this batch.
      const calls: Array<Record<string, unknown>> = []
      const outputs: Array<Record<string, unknown>> = []
      let end = index
      while (end < input.items.length) {
        const entry = input.items[end]
        if (entry.type === "function_call") {
          if (outputs.length) break
          calls.push(entry)
        } else if (entry.type === "function_call_output") {
          outputs.push(entry)
        } else {
          break
        }
        end += 1
      }
      index = end - 1
      // Outputs carry only call_id, so the declared tool name is recovered from
      // the call it answers — functionResponse.name must match a declaration.
      const nameByCallId = new Map(calls.map((entry) => [String(entry.call_id), String(entry.name)]))
      const nameForOutput = (entry: Record<string, unknown>) =>
        nameByCallId.get(String(entry.call_id)) || String(entry.name || "function")

      // Gemini attaches the signature to the first call of a parallel batch, so
      // an unsigned first call means the batch cannot be replayed as tool calls
      // at all. Degrade the whole group to text rather than send it unsigned.
      const signed = calls.length > 0 && Boolean(readThoughtSignature(calls[0]))
      if (requireSignature && !signed) {
        if (calls.length) {
          contents.push({
            role: "model",
            parts: calls.map((entry) => ({
              text: `[Action Taken]: Called function ${String(entry.name)} with arguments ${JSON.stringify(asJsonObject(entry.arguments))}`,
            })),
          })
        }
        if (outputs.length) {
          contents.push({
            role: "user",
            parts: outputs.map((entry) => ({
              text: `[Action Result]: Function ${nameForOutput(entry)} returned ${JSON.stringify(asJsonObject(entry.output))}`,
            })),
          })
        }
        continue
      }

      if (calls.length) {
        contents.push({
          role: "model",
          parts: calls.map((entry) => {
            const signature = readThoughtSignature(entry)
            // thoughtSignature is a Part field, not a FunctionCall field.
            // Nesting it inside functionCall makes the API report it missing.
            return {
              functionCall: { name: String(entry.name), args: asJsonObject(entry.arguments) },
              ...(signature ? { thoughtSignature: signature } : {}),
            }
          }),
        })
      }
      if (outputs.length) {
        contents.push({
          role: "user",
          parts: outputs.map((entry) => ({
            functionResponse: { name: nameForOutput(entry), response: asJsonObject(entry.output) },
          })),
        })
      }
      continue
    }

    if (item.role === "assistant") {
      contents.push({ role: "model", parts: item.content ? [{ text: String(item.content) }] : [{ text: "..." }] })
      continue
    }
    contents.push({ role: "user", parts: textAndImageParts(item.content) })
  }

  const mergedContents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []
  for (const content of contents) {
    if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === content.role) {
      mergedContents[mergedContents.length - 1].parts.push(...content.parts)
    } else {
      mergedContents.push(content)
    }
  }

  const modelId = input.model.startsWith("gemini") ? input.model : "gemini-3.6-flash"

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: mergedContents as any,
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
          // The signature lives on the Part; the functionCall fallback only
          // covers older response shapes.
          thoughtSignature: readThoughtSignature(part as Record<string, unknown>)
            || readThoughtSignature(part.functionCall as Record<string, unknown>),
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
