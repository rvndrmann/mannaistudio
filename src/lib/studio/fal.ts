import { fal } from "@fal-ai/client"
import { videoModelMaxDuration, type ImageGenerationModelId, type VideoGenerationModelId } from "@/lib/studio/generation-models"
import type { OpenAIImageQuality } from "@/lib/studio/image-quality"
import { activeCredentialPart } from "@/lib/byok/active-credential"

export class FalProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "FalProviderError"
  }
}

/** The customer's own fal key when one is serving this job, the platform's otherwise. */
function getFalKey() {
  const own = activeCredentialPart("fal", "apiKey")
  if (own) return own
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY
  if (!key) throw new FalProviderError("fal.ai API key is not configured. Add FAL_KEY to the server environment.", 503)
  return key
}

/** Sunburst Edit takes up to sixteen reference images; the Flux models take one. */
const SUNBURST_EDIT_ENDPOINT = "openai/gpt-image-2.5/sunburst/edit"
const SUNBURST_TEXT_TO_IMAGE_ENDPOINT = "openai/gpt-image-2.5/sunburst/text-to-image"
const SUNBURST_EDIT_MAX_REFERENCES = 16

export function falImageEndpoint(model: ImageGenerationModelId): string {
  if (model === "fal-gpt-image-2-5-sunburst-edit") return SUNBURST_EDIT_ENDPOINT
  if (model === "fal-gpt-image-2-5-sunburst") return SUNBURST_TEXT_TO_IMAGE_ENDPOINT
  if (model === "fal-flux-3") return "fal-ai/flux-pro/v1.1"
  if (model === "fal-flux-realism") return "fal-ai/flux-realism"
  return "fal-ai/flux/dev"
}

/**
 * The shot's aspect ratio as one of the seven canvases Sunburst accepts.
 *
 * The edit endpoint reads its canvas off the picture it is given; text-to-image
 * has nothing to read, so an unmapped ratio would render every vertical drama
 * as a square and charge full price for it.
 */
function falImageSize(aspectRatio?: string): string {
  switch ((aspectRatio || "").trim()) {
    case "9:16": return "portrait_16_9"
    case "3:4": return "portrait_4_3"
    case "16:9":
    case "21:9": return "landscape_16_9"
    case "4:3": return "landscape_4_3"
    default: return "square_hd"
  }
}

/**
 * One payload builder for both the queued and the held-open path, so the two
 * cannot drift into sending different things to the same model.
 *
 * The Flux endpoints take `image_url` and a named size; Sunburst Edit takes
 * `image_urls` and infers its canvas from them, which is what keeps an edit the
 * same shape as the picture it came from. Sending square_hd there would
 * silently reframe every edit to 1:1.
 */
function falImagePayload(
  input: { prompt: string; referenceUrls?: string[]; quality?: OpenAIImageQuality; aspectRatio?: string },
  endpoint: string,
): Record<string, unknown> {
  if (endpoint === SUNBURST_TEXT_TO_IMAGE_ENDPOINT) {
    // The same model and the same tiers as the edit twin, drawing from nothing
    // but the prompt. References are ignored rather than refused: this endpoint
    // has no input to edit, and silently sending them would change nothing.
    return {
      prompt: input.prompt,
      image_size: falImageSize(input.aspectRatio),
      quality: input.quality || "high",
      num_images: 1,
      output_format: "png",
    }
  }
  if (endpoint !== SUNBURST_EDIT_ENDPOINT) {
    return {
      prompt: input.prompt,
      image_size: "square_hd",
      ...(input.referenceUrls?.length ? { image_url: input.referenceUrls[0] } : {}),
    }
  }
  // An edit model with nothing to edit is a 422 from the provider and a charged
  // job here. Said plainly instead, because the fix is to attach a reference.
  if (!input.referenceUrls?.length) {
    throw new FalProviderError(
      "GPT Image 2.5 Sunburst Edit edits an existing picture, so it needs at least one reference image. Attach one, or pick a text-to-image model.",
      400,
    )
  }
  return {
    prompt: input.prompt,
    image_urls: input.referenceUrls.slice(0, SUNBURST_EDIT_MAX_REFERENCES),
    image_size: "auto",
    quality: input.quality || "high",
    num_images: 1,
    output_format: "png",
  }
}

export async function generateFalImage(input: {
  model: ImageGenerationModelId
  prompt: string
  referenceUrls?: string[]
  quality?: OpenAIImageQuality
  aspectRatio?: string
}) {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  const endpoint = falImageEndpoint(input.model)
  const payload = falImagePayload(input, endpoint)

  try {
    const res = await fal.subscribe(endpoint, { input: payload })
    const data = res.data as Record<string, unknown>
    const images = data?.images as Array<{ url?: string }> | undefined
    const url = images?.[0]?.url || (data?.image_url as string | undefined)

    if (!url) throw new FalProviderError("fal.ai image model did not return an image URL.")
    return { url, contentType: "image/png" }
  } catch (error) {
    if (error instanceof FalProviderError) throw error
    const msg = error instanceof Error ? error.message : "fal.ai image generation failed"
    throw new FalProviderError(`fal.ai request failed: ${msg}`)
  }
}

/**
 * Submits an image render to fal's queue and hands back the id that outlives
 * this request.
 *
 * `fal.subscribe` holds the connection until the picture is ready, which is
 * fine locally and fatal in production: Netlify stops a function at thirty
 * seconds and a Sunburst edit takes longer than that at the tiers worth using.
 * fal still finishes and still bills, so every such render produced a picture
 * nobody could reach and a job written off as "did not finish".
 *
 * The queue gives the same recoverable shape the OpenAI path already relies on
 * — the id is stored before any waiting happens, so a killed request leaves
 * something the poll can finish.
 */
export async function submitFalImage(input: {
  model: ImageGenerationModelId
  prompt: string
  referenceUrls?: string[]
  quality?: OpenAIImageQuality
  aspectRatio?: string
}) {
  getFalKey()
  fal.config({ credentials: getFalKey() })
  const endpoint = falImageEndpoint(input.model)
  const payload = falImagePayload(input, endpoint)

  try {
    const submitted = await fal.queue.submit(endpoint, { input: payload })
    return { id: submitted.request_id, endpoint }
  } catch (error) {
    if (error instanceof FalProviderError) throw error
    const msg = error instanceof Error ? error.message : "fal.ai image submission failed"
    throw new FalProviderError(`fal.ai request failed: ${msg}`)
  }
}

/**
 * Reads a queued image render back.
 *
 * Mirrors getFalVideoTask, including its hard-won detail: fal marks a request
 * COMPLETED even when it finished by rejecting the input, and the reason only
 * appears when the result is fetched.
 */
export async function getFalImageTask(requestId: string, endpoint: string) {
  fal.config({ credentials: getFalKey() })
  const appId = falQueueAppId(endpoint)

  try {
    const status = await fal.queue.status(appId, { requestId })
    const rawStatus = (status as { status?: string }).status || "UNKNOWN"
    if (rawStatus !== "COMPLETED") {
      return { status: "pending" as const, url: undefined, error: undefined }
    }

    try {
      const result = await fal.queue.result(appId, { requestId })
      const data = result.data as Record<string, unknown>
      const images = data?.images as Array<{ url?: string }> | undefined
      const url = images?.[0]?.url || (data?.image_url as string | undefined)
      if (!url) return { status: "failed" as const, url: undefined, error: "fal.ai finished without returning an image." }
      return { status: "completed" as const, url, error: undefined }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "fal.ai returned no result for this request."
      return { status: "failed" as const, url: undefined, error: msg }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "fal.ai status check failed"
    throw new FalProviderError(`fal.ai status check failed for ${endpoint}: ${msg}`)
  }
}

/**
 * Waits for a queued image, polling until it lands.
 *
 * Bounded well inside the host's own limit rather than optimistically: if this
 * runs out the job still holds the request id, so the picture is recovered by
 * the next poll instead of lost.
 */
export async function waitForFalImage(requestId: string, endpoint: string, timeoutMs = 240_000) {
  const startedAt = Date.now()
  let delay = 2_000
  while (Date.now() - startedAt < timeoutMs) {
    const poll = await getFalImageTask(requestId, endpoint)
    if (poll.status === "completed") return { url: poll.url! }
    if (poll.status === "failed") throw new FalProviderError(poll.error || "fal.ai image generation failed.")
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay + 1_000, 6_000)
  }
  throw new FalProviderError("fal.ai is still rendering. The job keeps its request id and will be finished by the next check.", 504)
}

/**
 * fal's model id for a Seedance 2.x family member.
 *
 * The owner is `bytedance`, not `fal-ai/bytedance` — only the older Seedance v1
 * and v1.5 models live under fal-ai. This module had every 2.x model under the
 * fal-ai prefix, and the result was a generation that looked submitted and then
 * failed with one word.
 *
 * What made it hard to see is that fal accepts the submission either way: the
 * queue is addressed by the first two path segments, `fal-ai/bytedance` is a
 * real app because the v1 models are there, and the status endpoint answered
 * COMPLETED after 0.13 seconds. Only fetching the result gave the reason —
 * `{"detail":"Path /seedance-2.5/image-to-video not found"}`, a 404 the fal
 * client raises as `Not Found`, which is what the user was shown. Every
 * Seedance 2.x render was charged for and none was ever rendered.
 */
const seedanceFamilies: Partial<Record<VideoGenerationModelId, string>> = {
  "fal-seedance-2-5": "bytedance/seedance-2.5",
  "fal-seedance-2-0": "bytedance/seedance-2.0",
  "fal-seedance-2-0-fast": "bytedance/seedance-2.0/fast",
  // Mini shared the fast endpoint before, so a mini render was billed at mini
  // rates and rendered on fast. It has its own model at fal.
  "fal-seedance-2-0-mini": "bytedance/seedance-2.0/mini",
}

/**
 * Which of a model's endpoints a request belongs on.
 *
 * fal splits a video model into three: text-to-video takes a prompt alone,
 * image-to-video animates one starting frame, and reference-to-video is given
 * several images to hold a character and a set across the take. They are
 * separate paths with separate inputs — `image_url` against `image_urls` — so
 * sending a cast of five to the image-to-video endpoint quietly renders from
 * the first one and drops the rest.
 */
export function falVideoEndpoint(model: VideoGenerationModelId, referenceCount = 0): string {
  const shape = referenceCount > 1 ? "reference" : referenceCount === 1 ? "image" : "text"
  const seedance = seedanceFamilies[model]
  if (seedance) return `${seedance}/${shape}-to-video`

  switch (model) {
    case "fal-kling-3":
      return referenceCount ? "fal-ai/kling-video/v3/pro/image-to-video" : "fal-ai/kling-video/v3/pro/text-to-video"
    case "fal-kling-o3":
      return "fal-ai/kling-video/o3/standard/reference-to-video"
    case "fal-kling-1-6-pro":
      return referenceCount ? "fal-ai/kling-video/v1.6/pro/image-to-video" : "fal-ai/kling-video/v1.6/pro/text-to-video"
    case "fal-minimax-h3":
      // Same mistake as Seedance, same fix: H3 is owned by `minimax`, and
      // `fal-ai/minimax/h3` is not a path fal serves.
      return `minimax/h3/${shape}-to-video`
    case "fal-minimax-video-01":
      return "fal-ai/minimax/video-01"
    default:
      return referenceCount ? "fal-ai/kling-video/v1.6/pro/image-to-video" : "fal-ai/kling-video/v1.6/pro/text-to-video"
  }
}

/**
 * The resolution a Seedance variant will actually accept.
 *
 * Fast and Mini stop at 720p and 2.5 stops at 1080p; asking any of them for
 * more is a 422 at the provider rather than a smaller picture. Clamping down is
 * safe for billing — the rate card charges for what was asked, which is at or
 * above what this returns.
 */
export function falSeedanceResolution(model: VideoGenerationModelId, resolution?: string): string {
  const allowed = model === "fal-seedance-2-0-fast" || model === "fal-seedance-2-0-mini"
    ? ["480p", "720p"]
    : model === "fal-seedance-2-5"
      ? ["480p", "720p", "1080p"]
      : ["480p", "720p", "1080p", "4k"]
  const wanted = (resolution || "720p").toLowerCase()
  return allowed.includes(wanted) ? wanted : allowed[allowed.length - 1]
}

export async function submitFalVideo(input: {
  model: VideoGenerationModelId
  prompt: string
  duration?: number
  resolution?: string
  ratio?: string
  referenceUrls?: string[]
  endReferenceUrl?: string
  audioEnabled?: boolean
}) {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  const referenceUrls = input.referenceUrls || []
  const hasRef = referenceUrls.length > 0
  const endpoint = falVideoEndpoint(input.model, referenceUrls.length)
  const seedance = Boolean(seedanceFamilies[input.model])

  try {
    // 2.5 renders up to 30 seconds; the rest stop at 15. Capping at a flat 15
    // silently shortened every long Seedance 2.5 clip. Four is fal's own floor
    // — it rejects anything shorter outright.
    const duration = Math.min(videoModelMaxDuration(input.model), Math.max(4, Math.round(input.duration || 4)))
    const payload: Record<string, unknown> = seedance
      ? {
        prompt: trimFalPrompt(input.prompt),
        // A string, and only ever one of the values fal enumerates. A number
        // here is rejected by the schema.
        duration: String(duration),
        resolution: falSeedanceResolution(input.model, input.resolution),
        // fal defaults this to true, so an unset flag meant every clip came
        // back with audio whether or not the shot asked for any.
        generate_audio: input.audioEnabled !== false,
      }
      : {
        prompt: trimFalPrompt(input.prompt),
        aspect_ratio: input.ratio || "9:16",
        duration,
      }

    if (seedance) {
      if (referenceUrls.length > 1) {
        // reference-to-video takes the whole cast, and takes no starting frame
        // — it has neither image_url nor end_image_url.
        payload.image_urls = referenceUrls
        payload.aspect_ratio = input.ratio || "9:16"
      } else if (hasRef) {
        payload.image_url = referenceUrls[0]
        if (input.endReferenceUrl) payload.end_image_url = input.endReferenceUrl
        // Deliberately no aspect_ratio: image-to-video takes its shape from the
        // frame it is given, and fal documents the field as always "auto" here.
      } else {
        payload.aspect_ratio = input.ratio || "9:16"
      }
    } else if (hasRef) {
      if (input.model === "fal-kling-o3") {
        payload.start_image_url = referenceUrls[0]
        payload.end_image_url = input.endReferenceUrl || referenceUrls[1]
        payload.image_urls = referenceUrls.slice(input.endReferenceUrl || referenceUrls[1] ? 2 : 1, 5)
      } else {
        payload.image_url = referenceUrls[0]
        if (input.endReferenceUrl) payload.end_image_url = input.endReferenceUrl
      }
      if (referenceUrls.length > 1) {
        payload.reference_image_urls = referenceUrls
      }
    }

    const result = await fal.queue.submit(endpoint, {
      input: payload,
    })

    return { id: result.request_id, requestId: result.request_id, endpoint }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "fal.ai video submission failed"
    throw new FalProviderError(`fal.ai request failed: ${msg}`)
  }
}

/**
 * fal rejects a prompt over 2,500 characters with a 422 the queue still reports
 * as COMPLETED, so an over-long prompt looked exactly like a video that never
 * finished. Prompt sheets here run long — a Seedance scene prompt with its
 * character lock block clears 2,500 easily — so the prompt is trimmed to fit
 * rather than sent to be refused.
 */
export const falPromptLimit = 2_500

export function trimFalPrompt(prompt: string): string {
  const text = (prompt || "").trim()
  if (text.length <= falPromptLimit) return text
  const cut = text.slice(0, falPromptLimit)
  // Prefer the last sentence end, then the last word, so the prompt does not
  // stop mid-word and leave the model reading a fragment.
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  if (sentence > falPromptLimit * 0.6) return cut.slice(0, sentence + 1).trim()
  const word = cut.lastIndexOf(" ")
  return (word > falPromptLimit * 0.6 ? cut.slice(0, word) : cut).trim()
}

/**
 * fal addresses its queue by app id — the first two path segments — not by the
 * full endpoint a request was submitted to.
 *
 * Polling the full path returns 405 with an empty body, which this module read
 * as "not finished", so a video fal had already rendered never landed: the job
 * sat in `processing` forever and the shot span its generating animation until
 * someone gave up. Every fal video model was affected; only BytePlus, which
 * polls a different API entirely, appeared to work.
 */
export function falQueueAppId(endpoint: string): string {
  return endpoint.split("/").filter(Boolean).slice(0, 2).join("/")
}

// The endpoint a request was submitted to is required to poll it. Defaulting to
// an unrelated model returns "Not Found" for a job that is running perfectly
// well, which reads as a failed generation.
export async function getFalVideoTask(taskId: string, endpoint = "fal-ai/kling-video/v1.6/pro/text-to-video") {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  try {
    const appId = falQueueAppId(endpoint)
    const status = await fal.queue.status(appId, {
      requestId: taskId,
      logs: true,
    })

    const rawStatus = (status as { status?: string }).status || "UNKNOWN"

    if (rawStatus === "COMPLETED") {
      let videoUrl: string | undefined
      let resultError = ""
      try {
        const result = await fal.queue.result(appId, { requestId: taskId })
        const data = result.data as Record<string, unknown>
        const videoObj = data?.video as { url?: string } | undefined
        videoUrl = videoObj?.url || (data?.video_url as string | undefined)
      } catch (error) {
        // fal marks a request COMPLETED even when it finished by rejecting the
        // input, and the reason only appears when the result is fetched.
        resultError = error instanceof Error ? error.message : "fal.ai returned no result for this request."
      }

      // Reporting "succeeded" with no url left the job processing for ever,
      // because the caller waits for a video that is never coming.
      if (!videoUrl) {
        return {
          id: taskId,
          status: "failed" as const,
          content: undefined,
          error: { message: resultError || "fal.ai finished this request without returning a video." },
        }
      }

      return {
        id: taskId,
        status: "succeeded" as const,
        content: { video_url: videoUrl },
        error: undefined,
      }
    }

    if (rawStatus === "IN_PROGRESS" || rawStatus === "IN_QUEUE") {
      return {
        id: taskId,
        status: "running" as const,
        content: undefined,
        error: undefined,
      }
    }

    return {
      id: taskId,
      status: "failed" as const,
      content: undefined,
      error: { message: `Task status: ${rawStatus}` },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch fal.ai task status"
    throw new FalProviderError(`fal.ai status check failed for ${endpoint}: ${msg}`)
  }
}
