import { describe, expect, it } from "vitest"
import { blockedByCredits, resolveGenerationSource } from "./generation-source"

const GPT_IMAGE = "gpt-image-2" as const
const SEEDANCE = "dreamina-seedance-2-5-260628" as const

describe("which account a generation runs on", () => {
  it("charges credits when nothing is connected", () => {
    const source = resolveGenerationSource({ model: GPT_IMAGE, connectedProviders: [], platformCredits: 12 })
    expect(source).toMatchObject({ ownKey: false, credits: 12, label: "12" })
  })

  it("charges nothing on a connected key, and says so", () => {
    const source = resolveGenerationSource({ model: SEEDANCE, connectedProviders: ["byteplus"], platformCredits: 20 })
    expect(source).toMatchObject({ ownKey: true, provider: "byteplus", credits: 0, label: "Your key" })
  })

  it("keeps the two apart per provider", () => {
    // Connecting BytePlus does not make an OpenAI keyframe free. This is the
    // separation the credit system depends on: one provider at a time, never a
    // blended bill.
    const connectedProviders = ["byteplus"]
    expect(resolveGenerationSource({ model: SEEDANCE, connectedProviders, platformCredits: 20 }).ownKey).toBe(true)
    expect(resolveGenerationSource({ model: GPT_IMAGE, connectedProviders, platformCredits: 12 }).ownKey).toBe(false)
    expect(resolveGenerationSource({ model: GPT_IMAGE, connectedProviders, platformCredits: 12 }).credits).toBe(12)
  })
})

describe("when a low balance should stop a generation", () => {
  it("stops one the studio would pay for", () => {
    const source = resolveGenerationSource({ model: GPT_IMAGE, connectedProviders: [], platformCredits: 12 })
    expect(blockedByCredits(source, 4)).toBe(true)
    expect(blockedByCredits(source, 12)).toBe(false)
  })

  it("never stops one running on the customer's own key", () => {
    // The bug this replaces: a user out of credits who connected their own key
    // found the generate button greyed out behind "buy more credits", over a
    // cost nobody was going to charge them.
    const source = resolveGenerationSource({ model: SEEDANCE, connectedProviders: ["byteplus"], platformCredits: 20 })
    expect(blockedByCredits(source, 0)).toBe(false)
    expect(blockedByCredits(source, null)).toBe(false)
  })

  it("does not block while the balance is still unknown", () => {
    const source = resolveGenerationSource({ model: GPT_IMAGE, connectedProviders: [], platformCredits: 12 })
    expect(blockedByCredits(source, null)).toBe(false)
  })
})
