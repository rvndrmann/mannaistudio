import type { ImageGenerationModelId, VideoGenerationModelId } from "@/lib/studio/generation-models"

const defaultBaseUrl = "https://ark.ap-southeast.bytepluses.com/api/v3"

export class BytePlusProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "BytePlusProviderError"
  }
}

function apiKey() {
  const key = process.env.ARK_API_KEY || process.env.BYTEPLUS_ARK_API_KEY
  if (!key) throw new BytePlusProviderError("BytePlus ModelArk is not configured. Add ARK_API_KEY to the server environment.", 503)
  return key
}

export function formatBytePlusError(data: Record<string, unknown>, status: number) {
  const nestedError = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : null
  const detail = typeof nestedError?.message === "string"
    ? nestedError.message
    : typeof data.message === "string"
      ? data.message
      : "BytePlus returned an unexpected error response."
  const redacted = detail
    .replace(/\baccount\s+\d+\b/gi, "account")
    .replace(/\bRequest id:\s*[a-z0-9-]+\b/gi, "Request id: redacted")
  return `BytePlus request failed (${status}): ${redacted}`
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${process.env.BYTEPLUS_ARK_BASE_URL || defaultBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", ...init.headers },
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new BytePlusProviderError(formatBytePlusError(data, response.status), response.status)
  }
  return data
}

export async function generateBytePlusImage(input: { model: ImageGenerationModelId; prompt: string; referenceUrls?: string[] }) {
  const data = await request("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      ...(input.referenceUrls?.length ? { image: input.referenceUrls.length === 1 ? input.referenceUrls[0] : input.referenceUrls } : {}),
      size: "2K",
      output_format: "png",
      response_format: "url",
      watermark: false,
    }),
  }) as { data?: Array<{ url?: string }> }
  const url = data.data?.[0]?.url
  if (!url) throw new BytePlusProviderError("Seedream did not return an image URL.")
  return { url, contentType: "image/png" }
}

export async function submitBytePlusVideo(input: { model: VideoGenerationModelId; prompt: string; duration: number; resolution: string; ratio: string; referenceUrls?: string[]; generationMode?: "keyframe" | "multi_image" }) {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }]
  const referenceUrls = input.referenceUrls || []
  if (input.generationMode === "keyframe") {
    referenceUrls.forEach((url, index) => content.push({ type: "image_url", image_url: { url }, role: index === 0 ? "first_frame" : index === 1 ? "last_frame" : "reference_image" }))
  } else {
    for (const url of referenceUrls) content.push({ type: "image_url", image_url: { url }, role: "reference_image" })
  }
  const maxDuration = input.model === "dreamina-seedance-2-5-260628" ? 30 : 15
  const data = await request("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      content,
      generate_audio: true,
      duration: Math.min(maxDuration, Math.max(4, Math.round(input.duration))),
      resolution: input.resolution === "480p" ? "480p" : "720p",
      ratio: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(input.ratio) ? input.ratio : "9:16",
      watermark: false,
    }),
  })
  if (typeof data.id !== "string") throw new BytePlusProviderError("BytePlus did not return a video task ID.")
  return { id: data.id, response: data }
}

export async function getBytePlusVideoTask(taskId: string) {
  return request(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, { method: "GET" }) as Promise<{
    id: string
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
    content?: { video_url?: string }
    error?: { message?: string }
    usage?: { completion_tokens?: number; total_tokens?: number }
  }>
}
