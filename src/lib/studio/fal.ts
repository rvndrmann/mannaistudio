import { fal } from "@fal-ai/client"
import { videoModelMaxDuration, type ImageGenerationModelId, type VideoGenerationModelId } from "@/lib/studio/generation-models"

export class FalProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "FalProviderError"
  }
}

function getFalKey() {
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
      endpoint = hasRef ? "fal-ai/kling-video/o3/pro/image-to-video" : "fal-ai/kling-video/o3/pro/text-to-video"
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
      prompt: input.prompt,
      aspect_ratio: input.ratio || "9:16",
      // 2.5 renders up to 30 seconds; the rest stop at 15. Capping at a flat 15
      // silently shortened every long Seedance 2.5 clip.
      duration: Math.min(videoModelMaxDuration(input.model), Math.max(3, Math.round(input.duration || 4))),
    }

    if (hasRef && input.referenceUrls?.length) {
      payload.image_url = input.referenceUrls[0]
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

// The endpoint a request was submitted to is required to poll it. Defaulting to
// an unrelated model returns "Not Found" for a job that is running perfectly
// well, which reads as a failed generation.
export async function getFalVideoTask(taskId: string, endpoint = "fal-ai/kling-video/v1.6/pro/text-to-video") {
  const falKey = getFalKey()
  fal.config({ credentials: falKey })

  try {
    const status = await fal.queue.status(endpoint, {
      requestId: taskId,
      logs: true,
    })

    const rawStatus = (status as { status?: string }).status || "UNKNOWN"

    if (rawStatus === "COMPLETED") {
      const result = await fal.queue.result(endpoint, { requestId: taskId })
      const data = result.data as Record<string, unknown>
      const videoObj = data?.video as { url?: string } | undefined
      const videoUrl = videoObj?.url || (data?.video_url as string | undefined)

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
