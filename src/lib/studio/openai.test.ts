import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analyzeImagesAsJson, clampOpenAIImageQuality, openAIImageModels, openAIImageQualityCeiling, openAIImageSizeForAspectRatio, readOpenAIImageResponse, submitOpenAIImage, supportsBackgroundImageResponse } from "./openai"
import { generationProvider, imageGenerationModels } from "./generation-models"
import { projectStoryboardImageModel } from "./project-image-model"
import { calculateCreditCost } from "./credits"

describe("OpenAI image canvas routing", () => {
  it("uses the landscape canvas for cinematic landscape ratios", () => {
    expect(openAIImageSizeForAspectRatio("16:9")).toBe("1536x1024")
    expect(openAIImageSizeForAspectRatio("21:9")).toBe("1536x1024")
  })

  it("uses the portrait canvas for vertical ratios", () => {
    expect(openAIImageSizeForAspectRatio("9:16")).toBe("1024x1536")
  })

  it("uses the square canvas when requested", () => {
    expect(openAIImageSizeForAspectRatio("1:1")).toBe("1024x1024")
  })
})

describe("analyzeImagesAsJson", () => {
  const sent: Array<Record<string, unknown>> = []

  beforeEach(() => {
    sent.length = 0
    process.env.OPENAI_API_KEY = "test-key"
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ output_text: '{"summary":"ok"}' }), { status: 200 })
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const userText = (body: Record<string, unknown>) => {
    const messages = body.input as Array<{ content: Array<{ type: string; text?: string }> }>
    return messages[0].content.filter((part) => part.type === "input_text").map((part) => part.text).join("\n")
  }

  it("puts the word json in the input messages, not only in the instructions", async () => {
    // json_object mode is rejected with a 400 unless "json" appears in the
    // input itself — the provider does not read `instructions` for it.
    await analyzeImagesAsJson({
      userId: "u1",
      instructions: "Respond with JSON only, matching this shape: {}",
      text: "Define the visual intent shared by these 2 reference images.",
      imageUrls: ["data:image/png;base64,AAA"],
    })
    expect(userText(sent[0])).toMatch(/json/i)
  })

  it("leaves a caller that already asked for json alone", async () => {
    await analyzeImagesAsJson({ userId: "u1", instructions: "x", text: "Answer as JSON.", imageUrls: [] })
    expect(userText(sent[0])).toBe("Answer as JSON.")
  })

  it("attaches every image to the same turn as the question", async () => {
    await analyzeImagesAsJson({ userId: "u1", instructions: "x", text: "look", imageUrls: ["data:image/png;base64,A", "data:image/png;base64,B"] })
    const content = (sent[0].input as Array<{ content: Array<{ type: string }> }>)[0].content
    expect(content.filter((part) => part.type === "input_image")).toHaveLength(2)
  })

  it("reads JSON back even when the model wrapped it in a fence", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ output_text: '```json\n{"summary":"fenced"}\n```' }), { status: 200 }))
    expect(await analyzeImagesAsJson({ userId: "u1", instructions: "x", text: "json", imageUrls: [] })).toEqual({ summary: "fenced" })
  })

  it("fails loudly rather than storing prose as a look", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ output_text: "I think it looks moody." }), { status: 200 }))
    await expect(analyzeImagesAsJson({ userId: "u1", instructions: "x", text: "json", imageUrls: [] })).rejects.toThrow(/unreadable/i)
  })
})

/**
 * A render OpenAI has accepted is work the user has already paid for, whatever
 * happens to the request that started it. Reading the response back is what
 * turns a lost picture into a recoverable one, so the reading has to be exact:
 * anything still running must never be mistaken for a failure, or the job is
 * refunded and the finished image discarded.
 */
describe("reading back a background image render", () => {
  it("keeps a queued render open", () => {
    expect(readOpenAIImageResponse({ status: "queued" })).toEqual({ status: "pending" })
  })

  it("keeps an in-progress render open", () => {
    expect(readOpenAIImageResponse({ status: "in_progress" })).toEqual({ status: "pending" })
  })

  it("recovers the image from a completed response", () => {
    const result = readOpenAIImageResponse({
      status: "completed",
      output: [{ type: "image_generation_call", status: "completed", result: Buffer.from("picture").toString("base64") }],
    })
    expect(result.status).toBe("completed")
    expect(result.status === "completed" && result.image.toString()).toBe("picture")
  })

  it("finds the image even when other output items come first", () => {
    const result = readOpenAIImageResponse({
      status: "completed",
      output: [
        { type: "message" },
        { type: "image_generation_call", result: Buffer.from("late").toString("base64") },
      ],
    })
    expect(result.status === "completed" && result.image.toString()).toBe("late")
  })

  it("reports a provider failure with its own message", () => {
    const result = readOpenAIImageResponse({ status: "failed", error: { message: "content policy" } })
    expect(result).toEqual({ status: "failed", error: "content policy" })
  })

  it("treats a completed response with no image as a failure", () => {
    const result = readOpenAIImageResponse({ status: "completed", output: [{ type: "message" }] })
    expect(result.status).toBe("failed")
  })
})

describe("GPT Image 2.5 Sunburst endpoint support", () => {
  it("renders through the synchronous image endpoints, not a background response", () => {
    // OpenAI lists /v1/responses as unsupported for this model, so the
    // recoverable background path the other GPT Image models use is not
    // available to it.
    expect(supportsBackgroundImageResponse("gpt-image-2.5-sunburst")).toBe(false)
    expect(supportsBackgroundImageResponse("gpt-image-2")).toBe(true)
    expect(supportsBackgroundImageResponse("gpt-image-1.5")).toBe(true)
  })

  it("is offered as an OpenAI image model", () => {
    expect(openAIImageModels).toContain("gpt-image-2.5-sunburst")
    expect(imageGenerationModels.find((model) => model.id === "gpt-image-2.5-sunburst")?.provider).toBe("openai")
    expect(generationProvider("gpt-image-2.5-sunburst")).toBe("openai")
  })

  it("refuses a background submit by name rather than letting OpenAI reject it", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    await expect(submitOpenAIImage({
      userId: "user-1",
      model: "gpt-image-2.5-sunburst",
      prompt: "a lighthouse at dusk",
    })).rejects.toThrow(/gpt-image-2\.5-sunburst cannot render as a background response/)
  })

  it("keeps the chosen OpenAI model instead of collapsing it to gpt-image-2", () => {
    // Every OpenAI model that was not 1.5 used to be rewritten to gpt-image-2
    // here, so a project set to Sunburst silently rendered on something else.
    const project = { metadata: { basic_settings: { storyboardImageModel: "gpt-image-2.5-sunburst" } } }
    expect(projectStoryboardImageModel(project)).toBe("gpt-image-2.5-sunburst")
  })

  it("is priced from its own measured token counts, not GPT Image 2's card", () => {
    // Measured on the square canvas, the dearest of the three. Carrying
    // gpt-image-2's figures here overcharged Medium 4x and High nearly 4x.
    expect(calculateCreditCost("gpt-image-2.5-sunburst", "image", 5, { quality: "Low" })).toBe(2)
    expect(calculateCreditCost("gpt-image-2.5-sunburst", "image", 5, { quality: "Medium" })).toBe(3)
    expect(calculateCreditCost("gpt-image-2.5-sunburst", "image", 5, { quality: "High" })).toBe(12)
    expect(calculateCreditCost("gpt-image-2.5-sunburst", "image", 5, { quality: "Ultra" })).toBe(20)
    expect(calculateCreditCost("gpt-image-2.5-sunburst", "image", 5, { quality: "Max" })).toBe(45)
  })

  it("offers xhigh and max only on the model that has them", () => {
    expect(openAIImageQualityCeiling("gpt-image-2.5-sunburst")).toContain("max")
    expect(openAIImageQualityCeiling("gpt-image-2")).not.toContain("max")
    expect(openAIImageQualityCeiling("gpt-image-1.5")).not.toContain("xhigh")
  })

  it("clamps a tier a model cannot serve down to its top one", () => {
    // Rather than letting an unsupported tier reach OpenAI as a 400 that names
    // neither the model nor the reason.
    expect(clampOpenAIImageQuality("gpt-image-2", "max")).toBe("high")
    expect(clampOpenAIImageQuality("gpt-image-2", "xhigh")).toBe("high")
    expect(clampOpenAIImageQuality("gpt-image-2.5-sunburst", "max")).toBe("max")
    expect(clampOpenAIImageQuality("gpt-image-2.5-sunburst", "low")).toBe("low")
  })

  it("never bills a clamped render less than it costs to make", () => {
    // Ultra and Max clamp to High on gpt-image-2, so they have to be priced at
    // what High renders. Falling through to `base` would bill 12 for a
    // 45-credit picture.
    for (const quality of ["Ultra", "Max"] as const) {
      expect(calculateCreditCost("gpt-image-2", "image", 5, { quality }))
        .toBe(calculateCreditCost("gpt-image-2", "image", 5, { quality: "High" }))
    }
  })
})
