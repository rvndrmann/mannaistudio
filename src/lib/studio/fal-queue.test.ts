import { describe, expect, it } from "vitest"
import { falPromptLimit, falQueueAppId, falSeedanceResolution, falVideoEndpoint, trimFalPrompt } from "./fal"
import { videoGenerationModels } from "./generation-models"

describe("falQueueAppId", () => {
  it("addresses the queue by app id, not the endpoint a request was submitted to", () => {
    // Polling the full path returns 405, which read as "still running" and left
    // every finished fal video stranded in the queue.
    expect(falQueueAppId("fal-ai/kling-video/o3/pro/image-to-video")).toBe("fal-ai/kling-video")
    expect(falQueueAppId("bytedance/seedance-2.5/image-to-video")).toBe("bytedance/seedance-2.5")
    expect(falQueueAppId("bytedance/seedance-2.0/fast/image-to-video")).toBe("bytedance/seedance-2.0")
    expect(falQueueAppId("minimax/h3/reference-to-video")).toBe("minimax/h3")
  })

  it("leaves an app id that is already two segments alone", () => {
    expect(falQueueAppId("fal-ai/kling-video")).toBe("fal-ai/kling-video")
  })

  it("survives stray slashes", () => {
    expect(falQueueAppId("/fal-ai/kling-video/v1.6/pro/text-to-video")).toBe("fal-ai/kling-video")
  })
})

describe("trimFalPrompt", () => {
  it("leaves a normal prompt alone", () => {
    expect(trimFalPrompt("  A woman drives through neon rain.  ")).toBe("A woman drives through neon rain.")
  })

  it("trims an over-long prompt to fit, on a sentence boundary", () => {
    // fal answers a longer prompt with a 422 that its queue still reports as
    // COMPLETED, so the shot span for ever instead of failing.
    const long = `${"Neon rain streaks across the windscreen. ".repeat(80)}Final beat.`
    const trimmed = trimFalPrompt(long)
    expect(trimmed.length).toBeLessThanOrEqual(falPromptLimit)
    expect(trimmed.endsWith(".")).toBe(true)
  })

  it("falls back to a word boundary when there is no sentence to cut on", () => {
    const trimmed = trimFalPrompt("word ".repeat(1_000))
    expect(trimmed.length).toBeLessThanOrEqual(falPromptLimit)
    expect(trimmed.endsWith("word")).toBe(true)
  })

  it("still returns something for a single unbroken run of characters", () => {
    const trimmed = trimFalPrompt("x".repeat(5_000))
    expect(trimmed).toHaveLength(falPromptLimit)
  })
})

/**
 * Every endpoint below was read from fal's own model registry
 * (https://fal.ai/api/models?keywords=…) rather than written from memory, which
 * is how the wrong ones got here: `fal-ai/bytedance/seedance-2.5/image-to-video`
 * looks exactly like a real fal path, and fal accepts a submission to it —
 * `fal-ai/bytedance` is a real app, because Seedance v1 lives there. The
 * request then reports COMPLETED and the result is a 404. Nothing renders and
 * the credits are spent.
 */
const FAL_VIDEO_ENDPOINTS = new Set([
  "bytedance/seedance-2.5/text-to-video",
  "bytedance/seedance-2.5/image-to-video",
  "bytedance/seedance-2.5/reference-to-video",
  "bytedance/seedance-2.0/text-to-video",
  "bytedance/seedance-2.0/image-to-video",
  "bytedance/seedance-2.0/reference-to-video",
  "bytedance/seedance-2.0/fast/text-to-video",
  "bytedance/seedance-2.0/fast/image-to-video",
  "bytedance/seedance-2.0/fast/reference-to-video",
  "bytedance/seedance-2.0/mini/text-to-video",
  "bytedance/seedance-2.0/mini/image-to-video",
  "bytedance/seedance-2.0/mini/reference-to-video",
  "minimax/h3/text-to-video",
  "minimax/h3/image-to-video",
  "minimax/h3/reference-to-video",
  "fal-ai/kling-video/v3/pro/text-to-video",
  "fal-ai/kling-video/v3/pro/image-to-video",
  "fal-ai/kling-video/o3/standard/reference-to-video",
  "fal-ai/kling-video/v1.6/pro/text-to-video",
  "fal-ai/kling-video/v1.6/pro/image-to-video",
  "fal-ai/minimax/video-01",
])

describe("falVideoEndpoint", () => {
  it("only ever names an endpoint fal actually serves", () => {
    for (const model of videoGenerationModels.filter((m) => m.provider === "fal")) {
      for (const references of [0, 1, 5]) {
        const endpoint = falVideoEndpoint(model.id, references)
        expect(FAL_VIDEO_ENDPOINTS, `${model.id} with ${references} references resolved to ${endpoint}`).toContain(endpoint)
      }
    }
  })

  it("puts Seedance under bytedance, not fal-ai", () => {
    // The bug itself. fal-ai/bytedance holds Seedance v1; 2.x is owned by
    // bytedance, and a request to the wrong one fails with a bare "Not Found".
    expect(falVideoEndpoint("fal-seedance-2-5", 1)).toBe("bytedance/seedance-2.5/image-to-video")
    expect(falVideoEndpoint("fal-seedance-2-0", 1)).toBe("bytedance/seedance-2.0/image-to-video")
  })

  it("sends a cast to reference-to-video and a single frame to image-to-video", () => {
    // Different endpoints with different inputs: image-to-video takes one
    // image_url, so a cast sent there renders from the first and drops the rest.
    expect(falVideoEndpoint("fal-seedance-2-5", 0)).toBe("bytedance/seedance-2.5/text-to-video")
    expect(falVideoEndpoint("fal-seedance-2-5", 1)).toBe("bytedance/seedance-2.5/image-to-video")
    expect(falVideoEndpoint("fal-seedance-2-5", 5)).toBe("bytedance/seedance-2.5/reference-to-video")
  })

  it("gives Mini its own model instead of rendering it on Fast", () => {
    // Mini was billed at mini rates and rendered on the fast endpoint.
    expect(falVideoEndpoint("fal-seedance-2-0-mini", 1)).toBe("bytedance/seedance-2.0/mini/image-to-video")
    expect(falVideoEndpoint("fal-seedance-2-0-fast", 1)).toBe("bytedance/seedance-2.0/fast/image-to-video")
  })
})

describe("falSeedanceResolution", () => {
  it("keeps a resolution the variant can serve", () => {
    expect(falSeedanceResolution("fal-seedance-2-5", "1080p")).toBe("1080p")
    expect(falSeedanceResolution("fal-seedance-2-0-fast", "480p")).toBe("480p")
  })

  it("clamps to the variant's ceiling rather than being refused at the provider", () => {
    expect(falSeedanceResolution("fal-seedance-2-0-fast", "1080p")).toBe("720p")
    expect(falSeedanceResolution("fal-seedance-2-0-mini", "4K")).toBe("720p")
    expect(falSeedanceResolution("fal-seedance-2-5", "4K")).toBe("1080p")
  })

  it("keeps 4K for the one variant that renders it", () => {
    expect(falSeedanceResolution("fal-seedance-2-0", "4K")).toBe("4k")
  })
})
