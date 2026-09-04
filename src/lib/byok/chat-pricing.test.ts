import { describe, expect, it } from "vitest"
import { CHAT_MARKUP, CHAT_TOKEN_RATES, FALLBACK_TOKEN_RATE, chatTurnCredits, providerCostUsd } from "./chat-pricing"
import { defaultDirectorModels } from "@/lib/studio/ai-models"

describe("what a chat turn costs us", () => {
  it("prices Luna at its published rate", () => {
    // 100k in at $0.20/M plus 5k out at $1.20/M.
    const cost = providerCostUsd("gpt-5.6-luna", { input_tokens: 100_000, output_tokens: 5_000 })
    expect(cost).toBeCloseTo(0.02 + 0.006, 6)
  })

  it("charges the fallback rate for a model with no entry", () => {
    // An unpriced model is usually a newer one. Guessing low serves it at a
    // loss with nothing to notice.
    const usage = { input_tokens: 100_000, output_tokens: 5_000 }
    const unknown = providerCostUsd("some-new-model", usage)
    expect(unknown).toBeCloseTo(
      (100_000 / 1e6) * FALLBACK_TOKEN_RATE.inputPerMillion + (5_000 / 1e6) * FALLBACK_TOKEN_RATE.outputPerMillion,
      6,
    )
  })

  it("never lets the fallback undercut a model the card prices", () => {
    // The fallback used to be derived from the dearest card entry, so retiring
    // an expensive model silently made every unpriced model cheaper. It is a
    // fixed ceiling now, and this is the property that has to hold.
    for (const rate of Object.values(CHAT_TOKEN_RATES)) {
      expect(FALLBACK_TOKEN_RATE.inputPerMillion).toBeGreaterThanOrEqual(rate.inputPerMillion)
      expect(FALLBACK_TOKEN_RATE.outputPerMillion).toBeGreaterThanOrEqual(rate.outputPerMillion)
    }
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

  it("costs more on an unpriced model than on the one the card quotes", () => {
    // The direction that matters: an unknown model must never come out cheaper
    // than a known one, or adding a model to the selector and forgetting its
    // rate would quietly discount it.
    const usage = { input_tokens: 80_000, output_tokens: 3_000 }
    expect(chatTurnCredits("some-unlisted-model", usage))
      .toBeGreaterThan(chatTurnCredits("gpt-5.6-luna", usage))
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
