import { describe, expect, it } from "vitest"
import { editorAiProviderForModel, editorAiRequestBody } from "./editor-ai"

describe("editorAiProviderForModel", () => {
  it("sends Gemini models to Google and everything else to OpenAI", () => {
    expect(editorAiProviderForModel("gemini-3.7-flash")).toBe("gemini")
    expect(editorAiProviderForModel("models/gemini-2.5-pro")).toBe("gemini")
    expect(editorAiProviderForModel("gpt-5.6-luna")).toBe("openai")
  })
})

describe("editorAiRequestBody", () => {
  const messages = [{ role: "user", content: "Trim the first clip" }]

  it("forwards a tool-calling turn without streaming and within budget", () => {
    const body = editorAiRequestBody({ model: "gpt-5.6-luna", messages, tools: [{ type: "function" }], max_completion_tokens: 50_000, stream: true, user: "x", extra: 1 }, "openai")
    expect(body).toEqual({ model: "gpt-5.6-luna", stream: false, messages, tools: [{ type: "function" }], max_completion_tokens: 8_192 })
  })

  it("names the output budget the way Gemini's compatibility layer reads it", () => {
    const body = editorAiRequestBody({ model: "gemini-3.7-flash", messages, max_completion_tokens: 4096 }, "gemini")
    expect(body.max_tokens).toBe(4096)
    expect(body).not.toHaveProperty("max_completion_tokens")
  })

  it.each([
    ["no body", null],
    ["no model", { messages }],
    ["no messages", { model: "gpt-5.6-luna", messages: [] }],
    ["an array", [messages]],
  ])("refuses %s", (_label, body) => {
    expect(() => editorAiRequestBody(body, "openai")).toThrow()
  })
})
