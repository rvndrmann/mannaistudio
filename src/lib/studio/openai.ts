import { createHash } from "node:crypto"
import { defaultDirectorModelId, defaultDirectorModels } from "@/lib/studio/ai-models"

export const openAIImageModels = ["gpt-image-2", "gpt-image-1.5"] as const
export type OpenAIImageModel = (typeof openAIImageModels)[number]

export const openAIDirectorModels: string[] = defaultDirectorModels.map((model) => model.id)
export type OpenAIDirectorModel = string

export function defaultOpenAIDirectorModel(): OpenAIDirectorModel {
  const configured = process.env.OPENAI_DIRECTOR_MODEL
  return configured && openAIDirectorModels.includes(configured) ? configured : defaultDirectorModelId
}

export function isOpenAIDirectorModel(value: unknown): value is OpenAIDirectorModel {
  return typeof value === "string" && openAIDirectorModels.includes(value as OpenAIDirectorModel)
}

export class OpenAIProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "OpenAIProviderError"
  }
}

function apiKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new OpenAIProviderError("OpenAI is not configured. Add OPENAI_API_KEY to the server environment.", 503)
  return key
}

async function openAIRequest(path: string, init: RequestInit, userId: string) {
  const response = await fetch(`https://api.openai.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "OpenAI-Safety-Identifier": createHash("sha256").update(userId).digest("hex"),
      ...init.headers,
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new OpenAIProviderError(`OpenAI request failed (${response.status}): ${detail.slice(0, 500)}`, response.status)
  }
  return response
}

export async function createDirectorResponse(input: { userId: string; model?: OpenAIDirectorModel; instructions: string; messages: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }> }) {
  const model = input.model || defaultOpenAIDirectorModel()
  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.messages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({ role: message.role, content: message.content })),
    }),
  }, input.userId)
  const data = await response.json() as { id?: string; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }
  const content = data.output_text?.trim() || data.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text" || item.type === "text").map((item) => item.text || "").join("\n").trim()
  if (!content) {
    console.error("OpenAI director response did not contain text", JSON.stringify(data).slice(0, 4_000))
    throw new OpenAIProviderError("OpenAI returned no director response.")
  }
  return { id: data.id || "", content, usage: data.usage || {} }
}

export async function createOpenAIRealtimeClientSecret(input: { userId: string; voice: string; instructions: string }) {
  const response = await openAIRequest("/v1/realtime/client_secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
        instructions: input.instructions,
        audio: { output: { voice: input.voice } },
      },
    }),
  }, input.userId)
  const data = await response.json() as { value?: string; expires_at?: number; id?: string }
  if (!data.value) throw new OpenAIProviderError("OpenAI did not return a Realtime client secret.")
  return { sessionId: data.id || crypto.randomUUID(), ephemeralCredential: data.value, expiresAt: new Date((data.expires_at || Math.floor(Date.now() / 1000) + 60) * 1000).toISOString(), model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1" }
}

export async function generateOpenAIImage(input: { userId: string; model: OpenAIImageModel; prompt: string; referenceUrls?: string[] }) {
  const referenceUrls = input.referenceUrls || []
  const response = referenceUrls.length
    ? await openAIRequest("/v1/images/edits", {
      method: "POST",
      body: await openAIImageEditForm(input.model, input.prompt, referenceUrls),
    }, input.userId)
    : await openAIRequest("/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, prompt: input.prompt, size: "1024x1536", quality: "medium", output_format: "png" }),
    }, input.userId)
  const data = await response.json() as { data?: Array<{ b64_json?: string }> }
  const base64 = data.data?.[0]?.b64_json
  if (!base64) throw new OpenAIProviderError("OpenAI did not return an image.")
  return Buffer.from(base64, "base64")
}

async function openAIImageEditForm(model: OpenAIImageModel, prompt: string, referenceUrls: string[]) {
  const form = new FormData()
  form.append("model", model)
  form.append("prompt", prompt)
  form.append("size", "1024x1536")
  form.append("quality", "medium")
  form.append("output_format", "png")
  form.append("input_fidelity", "high")
  for (let index = 0; index < referenceUrls.length; index += 1) {
    const url = referenceUrls[index]
    const response = await fetch(url)
    if (!response.ok) throw new OpenAIProviderError(`Could not read reference image ${index + 1} (${response.status}).`)
    const contentType = response.headers.get("content-type") || "image/png"
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png"
    form.append("image[]", new Blob([await response.arrayBuffer()], { type: contentType }), `reference-${index + 1}.${extension}`)
  }
  return form
}
