import { createHash } from "node:crypto"
import { defaultDirectorModelId, defaultDirectorModels } from "@/lib/studio/ai-models"
import { activeCredentialPart } from "@/lib/byok/active-credential"

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

/**
 * The customer's own key when one is serving this job, the platform's
 * otherwise. Same single choke point as the other providers: if this read fell
 * back silently, a customer who connected a key would have their generation
 * billed to us while their credits went untouched.
 */
function apiKey() {
  const own = activeCredentialPart("openai", "apiKey")
  if (own) return own
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new OpenAIProviderError("OpenAI is not configured. Add OPENAI_API_KEY to the server environment.", 503)
  return key
}

/**
 * How long an image generation may hold the request open.
 *
 * The route's own budget is 300s, and a fetch with no timeout spends all of it:
 * the platform kills the function mid-call, so the catch that marks the job
 * failed and returns the credits never runs. The job is left `processing` and
 * only the stalled-job reconcile settles it, six minutes after the user pressed
 * the button, with a message that cannot say what went wrong.
 *
 * Well under the budget, so the failure path is always the one that runs: the
 * request gives up with a real error, the job is failed and refunded on the
 * spot, and the user waits three minutes for an answer instead of six for a
 * shrug. A healthy generation returns in 50-75 seconds, so this is far outside
 * the working range and only ever catches a hang.
 */
export const OPENAI_IMAGE_TIMEOUT_MS = 180_000

/**
 * The model that hosts the image_generation tool for background renders. The
 * picture is produced by the image model named in the tool; this one only
 * carries the call.
 */
const OPENAI_IMAGE_HOST_MODEL = "gpt-5.1"

/** Submitting and polling are ordinary API calls — quick, or something is wrong. */
const OPENAI_SUBMIT_TIMEOUT_MS = 60_000

/** A reference image is a storage read, not a generation. It is quick or broken. */
const REFERENCE_FETCH_TIMEOUT_MS = 30_000

/**
 * True when a fetch rejection is a timeout or an abort rather than a real
 * network failure. `AbortSignal.timeout` rejects with a TimeoutError DOMException
 * and an aborted controller with an AbortError, and neither carries a status —
 * left unrecognised they surfaced as an opaque "fetch failed".
 */
export function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = (error as { name?: unknown }).name
  return name === "TimeoutError" || name === "AbortError"
}

async function openAIRequest(path: string, init: RequestInit, userId: string, timeoutMs?: number) {
  let response: Response
  try {
    response = await fetch(`https://api.openai.com${path}`, {
      ...init,
      // Only when the caller asks. A streaming turn resolves its fetch as soon
      // as the headers land and then reads the body for as long as the model
      // talks, so a total-duration signal here would cut the reply off mid
      // sentence.
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "OpenAI-Safety-Identifier": createHash("sha256").update(userId).digest("hex"),
        ...init.headers,
      },
    })
  } catch (error) {
    if (timeoutMs && isAbortLikeError(error)) {
      // 504, so the caller reports a provider that did not answer rather than a
      // request the user could fix by changing something.
      throw new OpenAIProviderError(`OpenAI did not respond within ${Math.round(timeoutMs / 1000)}s. Nothing was generated — try again.`, 504)
    }
    throw error
  }
  if (!response.ok) {
    const detail = await response.text()
    throw new OpenAIProviderError(`OpenAI request failed (${response.status}): ${detail.slice(0, 500)}`, response.status)
  }
  return response
}

/**
 * Reads images and returns the model's parsed JSON answer.
 *
 * Separate from createDirectorResponse because that one takes plain strings and
 * this turn is multimodal, and because the caller here wants an object it can
 * validate rather than prose it has to hope about. JSON mode is asked for at the
 * provider, so a model that drifts into an explanation fails loudly at parse
 * time instead of being stored as a broken look.
 */
export async function analyzeImagesAsJson(input: {
  userId: string
  model?: OpenAIDirectorModel
  instructions: string
  text: string
  imageUrls: string[]
}): Promise<unknown> {
  const model = input.model || defaultOpenAIDirectorModel()
  // json_object mode is rejected outright unless the word "json" appears in the
  // input messages — the provider does not count `instructions`, so a caller
  // that spelled out its JSON contract there still fails with a 400. Asked for
  // here rather than left to each caller, so the request cannot be built
  // without the thing that makes it legal.
  const text = /json/i.test(input.text) ? input.text : `${input.text}\n\nRespond with JSON only.`
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text }]
  for (const url of input.imageUrls) content.push({ type: "input_image", image_url: url })

  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
    }),
  }, input.userId)

  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }
  const raw = data.output_text?.trim()
    || (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text" || item.type === "text").map((item) => item.text || "").join("").trim()
  if (!raw) throw new OpenAIProviderError("OpenAI returned no analysis for the reference images.")
  try {
    return JSON.parse(raw)
  } catch {
    // Some models still wrap JSON in a fence despite json_object mode.
    const fenced = raw.match(/\{[\s\S]*\}/)
    if (fenced) {
      try { return JSON.parse(fenced[0]) } catch { /* fall through to the error below */ }
    }
    throw new OpenAIProviderError("OpenAI returned an unreadable analysis for the reference images.")
  }
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

/**
 * A plain conversational turn that can also look at pictures.
 *
 * createDirectorResponse takes strings, which is enough for the Director's own
 * chat but loses the product shot or character reference a brand agent is being
 * asked about. This one takes the provider's own input items, so the caller can
 * hand it multimodal content, and it exposes no tools: these agents advise and
 * write, they do not spend credits.
 */
export async function createVisionResponse(input: {
  userId: string
  model?: OpenAIDirectorModel
  instructions: string
  items: Array<Record<string, unknown>>
}) {
  const model = input.model || defaultOpenAIDirectorModel()
  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: input.instructions, input: input.items }),
  }, input.userId)
  const data = await response.json() as Parameters<typeof parseDirectorResponse>[0]
  const parsed = parseDirectorResponse(data)
  if (!parsed.content) {
    console.error("OpenAI vision response did not contain text", JSON.stringify(data).slice(0, 4_000))
    throw new OpenAIProviderError("OpenAI returned no response.")
  }
  return { id: parsed.id, content: parsed.content, usage: parsed.usage }
}

export type OpenAIDirectorFunction = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type OpenAIDirectorToolCall = { callId: string; name: string; arguments: unknown; thoughtSignature?: string }

export async function createDirectorToolTurn(input: {
  userId: string
  model?: OpenAIDirectorModel
  instructions: string
  items: Array<Record<string, unknown>>
  tools: OpenAIDirectorFunction[]
}) {
  const model = input.model || defaultOpenAIDirectorModel()
  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.items,
      // Zod validates every tool call before execution. Provider-side strict mode
      // rejects otherwise-valid optional/defaulted fields unless all are required.
      tools: input.tools.map((tool) => ({ type: "function", ...tool, strict: false })),
      tool_choice: "auto",
    }),
  }, input.userId)
  const data = await response.json() as {
    id?: string
    output_text?: string
    output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string; content?: Array<{ type?: string; text?: string }> }>
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  }
  return parseDirectorResponse(data)
}

function parseDirectorResponse(data: {
  id?: string
  output_text?: string
  output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string; content?: Array<{ type?: string; text?: string }> }>
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}) {
  const calls: OpenAIDirectorToolCall[] = (data.output || [])
    .filter((item) => item.type === "function_call" && item.call_id && item.name)
    .map((item) => {
      let args: unknown = {}
      try { args = JSON.parse(item.arguments || "{}") } catch { args = {} }
      return { callId: item.call_id as string, name: item.name as string, arguments: args }
    })
  const content = data.output_text?.trim() || (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text" || item.type === "text").map((item) => item.text || "").join("\n").trim()
  return { id: data.id || "", content, calls, usage: data.usage || {} }
}

/**
 * Same turn as createDirectorToolTurn, but reports assistant text as it
 * arrives. The Director runs a multi-step tool loop, so a turn that calls tools
 * emits no text at all — the visible progress in that case comes from the
 * timeline events the agent emits around each tool.
 */
export async function streamDirectorToolTurn(input: {
  userId: string
  model?: OpenAIDirectorModel
  instructions: string
  items: Array<Record<string, unknown>>
  tools: OpenAIDirectorFunction[]
  onTextDelta?: (delta: string) => void
}) {
  const model = input.model || defaultOpenAIDirectorModel()
  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.items,
      tools: input.tools.map((tool) => ({ type: "function", ...tool, strict: false })),
      tool_choice: "auto",
      stream: true,
    }),
  }, input.userId)

  if (!response.body) throw new OpenAIProviderError("OpenAI returned no response stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let completed: Parameters<typeof parseDirectorResponse>[0] | null = null
  let streamedText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE frames are separated by a blank line; keep the trailing partial.
    const frames = buffer.split("\n\n")
    buffer = frames.pop() || ""
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"))
      if (!dataLine) continue
      const payload = dataLine.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      let event: { type?: string; delta?: string; response?: Record<string, unknown> }
      try { event = JSON.parse(payload) } catch { continue }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        streamedText += event.delta
        input.onTextDelta?.(event.delta)
      } else if ((event.type === "response.completed" || event.type === "response.incomplete") && event.response) {
        completed = event.response as Parameters<typeof parseDirectorResponse>[0]
      } else if (event.type === "error") {
        throw new OpenAIProviderError(typeof (event as { message?: string }).message === "string" ? (event as { message: string }).message : "OpenAI stream failed")
      }
    }
  }

  if (!completed) return { id: "", content: streamedText.trim(), calls: [] as OpenAIDirectorToolCall[], usage: {} }
  const parsed = parseDirectorResponse(completed)
  return { ...parsed, content: parsed.content || streamedText.trim() }
}

export async function createOpenAIRealtimeClientSecret(input: { userId: string; voice: string; instructions: string; tools?: OpenAIDirectorFunction[] }) {
  const response = await openAIRequest("/v1/realtime/client_secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
        instructions: input.instructions,
        audio: { output: { voice: input.voice } },
        ...(input.tools?.length ? { tools: input.tools.map((tool) => ({ type: "function", ...tool })), tool_choice: "auto" } : {}),
      },
    }),
  }, input.userId)
  const data = await response.json() as { value?: string; expires_at?: number; id?: string }
  if (!data.value) throw new OpenAIProviderError("OpenAI did not return a Realtime client secret.")
  return { sessionId: data.id || crypto.randomUUID(), ephemeralCredential: data.value, expiresAt: new Date((data.expires_at || Math.floor(Date.now() / 1000) + 60) * 1000).toISOString(), model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1" }
}

/**
 * GPT Image supports three output canvases. Keep the requested composition
 * direction intact even where its canvas cannot exactly match a cinematic
 * ratio such as 16:9 (the landscape canvas is 3:2).
 */
export function openAIImageSizeForAspectRatio(aspectRatio?: string): "1024x1024" | "1536x1024" | "1024x1536" {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024"
    case "16:9":
    case "21:9":
    case "4:3":
    case "3:2":
      return "1536x1024"
    case "9:16":
    case "3:4":
    case "2:3":
    default:
      return "1024x1536"
  }
}

/** What the image endpoints accept, which is not what the UI calls it. */
export type OpenAIImageQuality = "low" | "medium" | "high"

export async function generateOpenAIImage(input: { userId: string; model: OpenAIImageModel; prompt: string; referenceUrls?: string[]; aspectRatio?: string; quality?: OpenAIImageQuality }) {
  const referenceUrls = input.referenceUrls || []
  const size = openAIImageSizeForAspectRatio(input.aspectRatio)
  const quality = input.quality || "medium"
  const response = referenceUrls.length
    ? await openAIRequest("/v1/images/edits", {
      method: "POST",
      body: await openAIImageEditForm(input.model, input.prompt, referenceUrls, size, quality),
    }, input.userId, OPENAI_IMAGE_TIMEOUT_MS)
    : await openAIRequest("/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, prompt: input.prompt, size, quality, output_format: "png" }),
    }, input.userId, OPENAI_IMAGE_TIMEOUT_MS)
  const data = await response.json() as { data?: Array<{ b64_json?: string }> }
  const base64 = data.data?.[0]?.b64_json
  if (!base64) throw new OpenAIProviderError("OpenAI did not return an image.")
  return Buffer.from(base64, "base64")
}

/**
 * Starts an image generation that outlives this request.
 *
 * The synchronous endpoints hold the whole render on one HTTP connection, so a
 * function killed mid-call loses an image OpenAI has already produced and
 * billed. Nothing identifies that work afterwards — there is no handle to ask
 * about — so the job could only be written off and refunded while the picture
 * sat, paid for, on OpenAI's side.
 *
 * Background responses give the work a name. This returns as soon as OpenAI has
 * accepted the request, and the id it returns can be read back for as long as
 * the response is stored: if this request dies, the next one recovers the image
 * instead of paying for it twice.
 */
export async function submitOpenAIImage(input: { userId: string; model: OpenAIImageModel; prompt: string; referenceUrls?: string[]; aspectRatio?: string; quality?: OpenAIImageQuality }) {
  const size = openAIImageSizeForAspectRatio(input.aspectRatio)
  const quality = input.quality || "medium"
  const referenceUrls = input.referenceUrls || []
  // References travel as data URLs in the message. The Responses API takes the
  // cast as input images alongside the instruction, which is the same thing the
  // edits endpoint did with a multipart form.
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.prompt }]
  for (let index = 0; index < referenceUrls.length; index += 1) {
    const url = referenceUrls[index]
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS) })
    } catch (error) {
      if (isAbortLikeError(error)) throw new OpenAIProviderError(`Reference image ${index + 1} took too long to read. Nothing was generated — try again.`, 504)
      throw error
    }
    if (!response.ok) throw new OpenAIProviderError(`Could not read reference image ${index + 1} (${response.status}).`)
    const contentType = response.headers.get("content-type") || "image/png"
    const base64 = Buffer.from(await response.arrayBuffer()).toString("base64")
    content.push({ type: "input_image", image_url: `data:${contentType};base64,${base64}` })
  }

  const response = await openAIRequest("/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_IMAGE_HOST_MODEL,
      // Both are required for recovery: background so the render is not tied to
      // this connection, store so the result can still be read back afterwards.
      background: true,
      store: true,
      input: [{ role: "user", content }],
      tools: [{ type: "image_generation", model: input.model, size, quality, output_format: "png" }],
      tool_choice: { type: "image_generation" },
    }),
  }, input.userId, OPENAI_SUBMIT_TIMEOUT_MS)
  const data = await response.json() as { id?: string; status?: string }
  if (!data.id) throw new OpenAIProviderError("OpenAI did not return a response id for the image.")
  return { responseId: data.id, status: data.status || "queued" }
}

export type OpenAIImagePoll =
  | { status: "pending" }
  | { status: "completed"; image: Buffer }
  | { status: "failed"; error: string }

/**
 * Reads back a background image generation by its response id.
 *
 * Safe to call any number of times and from any request — that is the point.
 * A job that recorded its response id can always be resolved later, whether the
 * request that started it finished, timed out, or was killed outright.
 */
export type OpenAIImageResponseBody = {
  status?: string
  error?: { message?: string } | null
  incomplete_details?: { reason?: string } | null
  output?: Array<{ type?: string; status?: string; result?: string }>
}

/**
 * What a retrieved response means, as a decision separate from fetching it.
 *
 * "pending" must be reported for anything still running, because the caller
 * settles a job on this answer — reading an in-flight render as a failure would
 * refund and discard work that is about to finish and has already been paid
 * for.
 */
export function readOpenAIImageResponse(data: OpenAIImageResponseBody): OpenAIImagePoll {
  const status = data.status || ""
  if (status === "queued" || status === "in_progress") return { status: "pending" }
  if (status === "failed" || status === "cancelled" || status === "incomplete") {
    return { status: "failed", error: data.error?.message || data.incomplete_details?.reason || `OpenAI image response ${status}` }
  }
  const call = (data.output || []).find((item) => item.type === "image_generation_call" && item.result)
  if (!call?.result) return { status: "failed", error: "OpenAI finished the response without returning an image." }
  return { status: "completed", image: Buffer.from(call.result, "base64") }
}

export async function retrieveOpenAIImage(responseId: string, userId: string): Promise<OpenAIImagePoll> {
  const response = await openAIRequest(`/v1/responses/${encodeURIComponent(responseId)}`, { method: "GET" }, userId, OPENAI_SUBMIT_TIMEOUT_MS)
  return readOpenAIImageResponse(await response.json() as OpenAIImageResponseBody)
}

async function openAIImageEditForm(model: OpenAIImageModel, prompt: string, referenceUrls: string[], size: ReturnType<typeof openAIImageSizeForAspectRatio>, quality: OpenAIImageQuality) {
  const form = new FormData()
  form.append("model", model)
  form.append("prompt", prompt)
  form.append("size", size)
  form.append("quality", quality)
  form.append("output_format", "png")
  if (model === "gpt-image-1.5") {
    form.append("input_fidelity", "high")
  }
  for (let index = 0; index < referenceUrls.length; index += 1) {
    const url = referenceUrls[index]
    // Bounded for the same reason as the generation itself: a storage read that
    // never returns spent the whole function budget before the model was even
    // asked for a picture.
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS) })
    } catch (error) {
      if (isAbortLikeError(error)) throw new OpenAIProviderError(`Reference image ${index + 1} took too long to read. Nothing was generated — try again.`, 504)
      throw error
    }
    if (!response.ok) throw new OpenAIProviderError(`Could not read reference image ${index + 1} (${response.status}).`)
    const contentType = response.headers.get("content-type") || "image/png"
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png"
    form.append("image[]", new Blob([await response.arrayBuffer()], { type: contentType }), `reference-${index + 1}.${extension}`)
  }
  return form
}
