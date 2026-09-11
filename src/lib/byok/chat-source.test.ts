import { describe, expect, it } from "vitest"
import { chatModelProvider } from "./chat-source"
import { defaultDirectorModels } from "@/lib/studio/ai-models"

describe("which provider serves a chat turn", () => {
  it("maps every model the studio offers on a customer key", () => {
    // A model nobody can route is a turn that silently runs on the platform
    // account, which is the whole failure this exists to prevent. The catalog
    // says which models have a customer-key route at all, so a new one cannot
    // slip past this by simply not being listed here.
    for (const model of defaultDirectorModels.filter((entry) => entry.byok)) {
      expect(chatModelProvider(model.id)).not.toBeNull()
    }
  })

  it("has nowhere to route a model marked as platform-only", () => {
    // Claude is deliberately platform-only: there is no Anthropic BYOK
    // provider, so these turns are ours to pay for and the catalog says so.
    for (const model of defaultDirectorModels.filter((entry) => !entry.byok)) {
      expect(chatModelProvider(model.id)).toBeNull()
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
