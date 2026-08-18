import { describe, expect, it } from "vitest"
import { falPromptLimit, falQueueAppId, trimFalPrompt } from "./fal"

describe("falQueueAppId", () => {
  it("addresses the queue by app id, not the endpoint a request was submitted to", () => {
    // Polling the full path returns 405, which read as "still running" and left
    // every finished fal video stranded in the queue.
    expect(falQueueAppId("fal-ai/kling-video/o3/pro/image-to-video")).toBe("fal-ai/kling-video")
    expect(falQueueAppId("fal-ai/bytedance/seedance-2.5/image-to-video")).toBe("fal-ai/bytedance")
    expect(falQueueAppId("fal-ai/bytedance/seedance-2.0/fast/image-to-video")).toBe("fal-ai/bytedance")
    expect(falQueueAppId("fal-ai/minimax/h3")).toBe("fal-ai/minimax")
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
