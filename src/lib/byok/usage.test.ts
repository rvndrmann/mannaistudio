import { describe, expect, it } from "vitest"
import { addTokenUsage, hasTokenCounts } from "./usage"

describe("adding up what a turn cost", () => {
  it("sums every round trip, rather than keeping the last", () => {
    // The bug this replaces: `usage = turn.usage` kept only the final step, so
    // a seven-step turn reported one step's tokens and was billed for one.
    const steps = [
      { input_tokens: 8_000, output_tokens: 200 },
      { input_tokens: 12_000, output_tokens: 350 },
      { input_tokens: 15_000, output_tokens: 900 },
    ]
    const total = steps.reduce<Record<string, unknown>>((acc, step) => addTokenUsage(acc, step), {})
    expect(total.input_tokens).toBe(35_000)
    expect(total.output_tokens).toBe(1_450)
  })

  it("ignores a step that reported nothing", () => {
    const total = addTokenUsage({ input_tokens: 100, output_tokens: 10 }, undefined)
    expect(total).toEqual({ input_tokens: 100, output_tokens: 10 })
  })

  it("treats missing counts as zero rather than NaN", () => {
    const total = addTokenUsage({}, { output_tokens: 5 })
    expect(total.input_tokens).toBe(0)
    expect(total.output_tokens).toBe(5)
  })
})

describe("knowing whether the provider told us anything", () => {
  it("is false for an empty or silent turn", () => {
    // A streaming turn that never reaches its completed event returns {}. That
    // has to be visible rather than quietly free.
    expect(hasTokenCounts(undefined)).toBe(false)
    expect(hasTokenCounts({})).toBe(false)
    expect(hasTokenCounts({ input_tokens: 0, output_tokens: 0 })).toBe(false)
  })

  it("is true once anything was counted", () => {
    expect(hasTokenCounts({ input_tokens: 1, output_tokens: 0 })).toBe(true)
  })
})
