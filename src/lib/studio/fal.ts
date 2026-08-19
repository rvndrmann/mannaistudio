import { fal } from "@fal-ai/client"
import { videoModelMaxDuration, type ImageGenerationModelId, type VideoGenerationModelId } from "@/lib/studio/generation-models"
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

export async function generateFalImage(input: {
  model: ImageGenerationModelId
  prompt: string
  referenceUrls?: string[]
}) {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  let endpoint = "fal-ai/flux/dev"
  if (input.model === "fal-flux-3") endpoint = "fal-ai/flux-pro/v1.1"
  else if (input.model === "fal-flux-realism") endpoint = "fal-ai/flux-realism"

  try {
    const res = await fal.subscribe(endpoint, {
      input: {
        prompt: input.prompt,
        image_size: "square_hd",
        ...(input.referenceUrls?.length ? { image_url: input.referenceUrls[0] } : {}),
      },
    })
    const data = res.data as Record<string, unknown>
    const images = data?.images as Array<{ url?: string }> | undefined
    const url = images?.[0]?.url || (data?.image_url as string | undefined)

    if (!url) throw new FalProviderError("fal.ai image model did not return an image URL.")
    return { url, contentType: "image/png" }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "fal.ai image generation failed"
    throw new FalProviderError(`fal.ai request failed: ${msg}`)
  }
}

export async function submitFalVideo(input: {
  model: VideoGenerationModelId
  prompt: string
  duration?: number
  resolution?: string
  ratio?: string
  referenceUrls?: string[]
  endReferenceUrl?: string
}) {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  const hasRef = Boolean(input.referenceUrls && input.referenceUrls.length > 0)
  // Every branch below assigns, including the default; this only has to be a
  // model that still exists, so a future edit cannot fall back to a retired one.
  let endpoint = "fal-ai/kling-video/v1.6/pro/text-to-video"

  switch (input.model) {
    case "fal-seedance-2-0":
      endpoint = hasRef ? "fal-ai/bytedance/seedance-2.0/image-to-video" : "fal-ai/bytedance/seedance-2.0/text-to-video"
      break
    case "fal-seedance-2-0-fast":
    case "fal-seedance-2-0-mini":
      endpoint = hasRef ? "fal-ai/bytedance/seedance-2.0/fast/image-to-video" : "fal-ai/bytedance/seedance-2.0/fast/text-to-video"
      break
    case "fal-seedance-2-5":
      endpoint = hasRef ? "fal-ai/bytedance/seedance-2.5/image-to-video" : "fal-ai/bytedance/seedance-2.5/text-to-video"
      break
    case "fal-kling-3":
      endpoint = hasRef ? "fal-ai/kling-video/v3/pro/image-to-video" : "fal-ai/kling-video/v3/pro/text-to-video"
      break
    case "fal-kling-o3":
      endpoint = "fal-ai/kling-video/o3/standard/reference-to-video"
      break
    case "fal-kling-1-6-pro":
      endpoint = hasRef ? "fal-ai/kling-video/v1.6/pro/image-to-video" : "fal-ai/kling-video/v1.6/pro/text-to-video"
      break
    case "fal-minimax-h3":
      endpoint = "fal-ai/minimax/h3"
      break
    case "fal-minimax-video-01":
      endpoint = "fal-ai/minimax/video-01"
      break
    default:
      endpoint = hasRef ? "fal-ai/kling-video/v1.6/pro/image-to-video" : "fal-ai/kling-video/v1.6/pro/text-to-video"
      break
  }

  try {
    const payload: Record<string, unknown> = {
      prompt: trimFalPrompt(input.prompt),
      aspect_ratio: input.ratio || "9:16",
      // 2.5 renders up to 30 seconds; the rest stop at 15. Capping at a flat 15
      // silently shortened every long Seedance 2.5 clip.
      duration: Math.min(videoModelMaxDuration(input.model), Math.max(3, Math.round(input.duration || 4))),
    }

    if (hasRef && input.referenceUrls?.length) {
      if (input.model === "fal-kling-o3") {
        payload.start_image_url = input.referenceUrls[0]
        payload.end_image_url = input.endReferenceUrl || input.referenceUrls[1]
        payload.image_urls = input.referenceUrls.slice(input.endReferenceUrl || input.referenceUrls[1] ? 2 : 1, 5)
      } else {
        payload.image_url = input.referenceUrls[0]
        if (input.endReferenceUrl) payload.end_image_url = input.endReferenceUrl
      }
      if (input.referenceUrls.length > 1) {
        payload.reference_image_urls = input.referenceUrls
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
