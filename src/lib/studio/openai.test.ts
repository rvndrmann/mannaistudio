import { describe, expect, it } from "vitest"
import { openAIImageSizeForAspectRatio } from "./openai"

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
