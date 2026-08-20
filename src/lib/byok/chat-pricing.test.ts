import { describe, expect, it } from "vitest"
import { CHAT_MARKUP, CHAT_TOKEN_RATES, chatTurnCredits, providerCostUsd } from "./chat-pricing"
import { defaultDirectorModels } from "@/lib/studio/ai-models"

describe("what a chat turn costs us", () => {
  it("prices Luna at its published rate", () => {
    // 100k in at $0.20/M plus 5k out at $1.20/M.
    const cost = providerCostUsd("gpt-5.6-luna", { input_tokens: 100_000, output_tokens: 5_000 })
    expect(cost).toBeCloseTo(0.02 + 0.006, 6)
  })

  it("prices Gemini Flash at its published rate", () => {
    const cost = providerCostUsd("gemini-3.6-flash", { input_tokens: 100_000, output_tokens: 5_000 })
    expect(cost).toBeCloseTo(0.075 + 0.01875, 6)
  })

  it("charges the dearest known rate for a model with no entry", () => {
    // An unpriced model is usually a newer one. Guessing low serves it at a
    // loss with nothing to notice.
    const unknown = providerCostUsd("some-new-model", { input_tokens: 100_000, output_tokens: 5_000 })
    const dearest = providerCostUsd("gemini-3.6-flash", { input_tokens: 100_000, output_tokens: 5_000 })
    expect(unknown).toBeCloseTo(dearest, 6)
  })
})

describe("what we charge for it", () => {
  it("applies the markup at one credit to the cent", () => {
    // $0.026 of provider cost, doubled, at 100 credits per dollar.
    expect(chatTurnCredits("gpt-5.6-luna", { input_tokens: 100_000, output_tokens: 5_000 }))
      .toBe(Math.ceil(0.026 * 100 * CHAT_MARKUP))
  })

  it("charges nothing for a turn that reported no usage", () => {
    // No evidence the turn happened, rather than evidence of a small one.
    expect(chatTurnCredits("gpt-5.6-luna", {})).toBe(0)
    expect(chatTurnCredits("gpt-5.6-luna", { input_tokens: 0, output_tokens: 0 })).toBe(0)
  })

  it("never charges a fraction of a credit for a real turn", () => {
    expect(chatTurnCredits("gpt-5.6-luna", { input_tokens: 100, output_tokens: 10 })).toBe(1)
  })

  it("costs several times more on Gemini than on Luna for the same turn", () => {
    // Worth knowing before choosing a default: Gemini Flash output is more than
    // three times Luna's, so a long agent turn can cost as much as the image it
    // was arranging.
    const usage = { input_tokens: 80_000, output_tokens: 3_000 }
    expect(chatTurnCredits("gemini-3.6-flash", usage)).toBeGreaterThan(chatTurnCredits("gpt-5.6-luna", usage) * 2)
  })
})

describe("the rate card", () => {
  it("prices every model the studio offers, so nothing falls to the fallback", () => {
    for (const model of defaultDirectorModels) {
      expect(CHAT_TOKEN_RATES[model.id]).toBeDefined()
    }
  })

  it("records where each figure came from, so it can be rechecked", () => {
    for (const rate of Object.values(CHAT_TOKEN_RATES)) {
      expect(rate.source).toBeTruthy()
      expect(rate.inputPerMillion).toBeGreaterThan(0)
      expect(rate.outputPerMillion).toBeGreaterThan(0)
    }
  })
})
