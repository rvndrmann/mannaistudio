import { describe, expect, it } from "vitest"
import { defaultDirectorRuntimeSettings, normalizeDirectorRuntimeSettings, runtimeInstructions, requestsFullAutoEnable } from "./director-runtime-settings"

describe("Director runtime settings", () => {
  it("normalizes partial persisted settings with safe defaults", () => {
    const settings = normalizeDirectorRuntimeSettings({ maxToolSteps: 6, nextActionLimit: 2, orchestrationInstructions: "Use saved context.", specialists: { script: "Read it." } })
    expect(settings.maxToolSteps).toBe(6)
    expect(settings).toEqual({ maxToolSteps: 6, nextActionLimit: 2, orchestrationInstructions: "Use saved context.", maxHandoffs: 2, maxConsultations: 3 })
  })


  it("carries handover and consultation ceilings, so two agents cannot pass one request back and forth", () => {
    const settings = normalizeDirectorRuntimeSettings({ orchestrationInstructions: "Use saved context.", maxHandoffs: 1, maxConsultations: 0 })
    expect(settings.maxHandoffs).toBe(1)
    expect(settings.maxConsultations).toBe(0)
    expect(normalizeDirectorRuntimeSettings({ orchestrationInstructions: "x" }).maxHandoffs).toBe(2)
  })

  it("builds orchestrator instructions without legacy specialist notes", () => {
    const instructions = runtimeInstructions(defaultDirectorRuntimeSettings)
    expect(instructions).not.toContain("Active specialist instructions:")
    expect(instructions).toContain("FAILURE RECOVERY")
    expect(instructions).toContain("Offer no more than 3 contextual next actions")
  })
})

describe("requestsFullAutoEnable", () => {
  it.each([
    "turn on full auto",
    "enable full-auto mode",
    "start autopilot",
  ])("proposes the mode for %s", (message) => {
    expect(requestsFullAutoEnable(message)).toBe(true)
  })

  it.each([
    "don't turn on full auto yet",
    "do not enable full auto",
    "how do I turn on full auto?",
    "what happens if I start autopilot?",
  ])("leaves %s for the agent to answer", (message) => {
    // Full auto spends a credit budget without stopping to ask, so a question
    // about it and a refusal of it must not both come back as a card offering
    // to switch it on.
    expect(requestsFullAutoEnable(message)).toBe(false)
  })
})
