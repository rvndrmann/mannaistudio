import { describe, expect, it } from "vitest"
import { chatModelProvider } from "./chat-source"
import { defaultDirectorModels } from "@/lib/studio/ai-models"

describe("which provider serves a chat turn", () => {
  it("maps every model the studio actually offers", () => {
    // A model nobody can route is a turn that silently runs on the platform
    // account, which is the whole failure this exists to prevent.
    for (const model of defaultDirectorModels) {
      expect(chatModelProvider(model.id)).not.toBeNull()
    }
  })

  it("routes the two current models", () => {
    expect(chatModelProvider("gpt-5.6-luna")).toBe("openai")
    expect(chatModelProvider("gemini-3.6-flash")).toBe("gemini")
  })

  it("survives a version bump, because a rename must not change who pays", () => {
    expect(chatModelProvider("gpt-6-something")).toBe("openai")
    expect(chatModelProvider("gemini-4.0-pro")).toBe("gemini")
  })

  it("returns nothing for a model it does not recognise", () => {
    expect(chatModelProvider("llama-3")).toBeNull()
    expect(chatModelProvider("")).toBeNull()
  })
})
