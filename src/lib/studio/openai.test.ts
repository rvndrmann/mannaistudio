import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analyzeImagesAsJson, openAIImageSizeForAspectRatio } from "./openai"

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
