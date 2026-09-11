import { beforeEach, describe, expect, it, vi } from "vitest"

const { submitted } = vi.hoisted(() => ({ submitted: [] as Array<{ endpoint: string; input: Record<string, unknown> }> }))

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: () => {},
    queue: {
      submit: async (endpoint: string, options: { input: Record<string, unknown> }) => {
        submitted.push({ endpoint, input: options.input })
        return { request_id: "req-test" }
      },
    },
  },
}))
import { submitFalVideo } from "./fal"

/**
 * What actually reaches fal, which is where this went wrong twice over: the
 * endpoint did not exist, and the payload would not have validated against it
 * either. Both failures look identical from the workspace — a request that
 * reports COMPLETED in a fraction of a second and yields no video.
 */
describe("what submitFalVideo sends", () => {
  beforeEach(() => {
    submitted.length = 0
    process.env.FAL_KEY = "test-key"
  })

  it("sends a cast to reference-to-video as image_urls", async () => {
    await submitFalVideo({
      model: "fal-seedance-2-5",
      prompt: "A tense two-shot in a dark hallway.",
      duration: 5,
      resolution: "720p",
      ratio: "9:16",
      referenceUrls: ["https://example.test/a.png", "https://example.test/b.png", "https://example.test/c.png"],
    })
    const [call] = submitted
    expect(call.endpoint).toBe("bytedance/seedance-2.5/reference-to-video")
    expect(call.input.image_urls).toHaveLength(3)
    // reference-to-video has neither field; sending them is a validation error.
    expect(call.input.image_url).toBeUndefined()
    expect(call.input.end_image_url).toBeUndefined()
    expect(call.input.aspect_ratio).toBe("9:16")
  })

  it("sends a single starting frame to image-to-video as image_url", async () => {
    await submitFalVideo({
      model: "fal-seedance-2-5",
      prompt: "Push in slowly.",
      duration: 5,
      referenceUrls: ["https://example.test/a.png"],
      endReferenceUrl: "https://example.test/z.png",
    })
    const [call] = submitted
    expect(call.endpoint).toBe("bytedance/seedance-2.5/image-to-video")
    expect(call.input.image_url).toBe("https://example.test/a.png")
    expect(call.input.end_image_url).toBe("https://example.test/z.png")
    expect(call.input.image_urls).toBeUndefined()
    // The frame decides the shape here; fal documents the field as always
    // "auto" on image-to-video.
    expect(call.input.aspect_ratio).toBeUndefined()
  })

  it("sends the duration as one of the strings fal enumerates", async () => {
    // A number is rejected by the schema, and fal's floor is four seconds.
    await submitFalVideo({ model: "fal-seedance-2-5", prompt: "x", duration: 3, referenceUrls: [] })
    expect(submitted[0].input.duration).toBe("4")
    submitted.length = 0
    await submitFalVideo({ model: "fal-seedance-2-5", prompt: "x", duration: 12, referenceUrls: [] })
    expect(submitted[0].input.duration).toBe("12")
  })

  it("never asks a clip for longer than its model renders", async () => {
    await submitFalVideo({ model: "fal-seedance-2-0", prompt: "x", duration: 30, referenceUrls: [] })
    expect(submitted[0].input.duration).toBe("15")
  })

  it("carries the resolution the shot was priced at", async () => {
    await submitFalVideo({ model: "fal-seedance-2-5", prompt: "x", resolution: "1080p", referenceUrls: [] })
    expect(submitted[0].input.resolution).toBe("1080p")
  })

  it("honours the audio switch instead of leaving fal's default on", async () => {
    await submitFalVideo({ model: "fal-seedance-2-5", prompt: "x", audioEnabled: false, referenceUrls: [] })
    expect(submitted[0].input.generate_audio).toBe(false)
    submitted.length = 0
    await submitFalVideo({ model: "fal-seedance-2-5", prompt: "x", audioEnabled: true, referenceUrls: [] })
    expect(submitted[0].input.generate_audio).toBe(true)
  })

  it("leaves the models that were never broken alone", async () => {
    await submitFalVideo({ model: "fal-kling-1-6-pro", prompt: "x", duration: 5, ratio: "16:9", referenceUrls: ["https://example.test/a.png"] })
    const [call] = submitted
    expect(call.endpoint).toBe("fal-ai/kling-video/v1.6/pro/image-to-video")
    expect(call.input.duration).toBe(5)
    expect(call.input.aspect_ratio).toBe("16:9")
  })
})
