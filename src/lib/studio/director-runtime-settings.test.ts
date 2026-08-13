import { describe, expect, it } from "vitest"
import { defaultDirectorRuntimeSettings, normalizeDirectorRuntimeSettings, runtimeInstructions } from "./director-runtime-settings"

describe("Director runtime settings", () => {
  it("normalizes partial persisted settings with safe defaults", () => {
    const settings = normalizeDirectorRuntimeSettings({ maxToolSteps: 6, nextActionLimit: 2, orchestrationInstructions: "Use saved context.", specialists: { script: "Read it." } })
    expect(settings.maxToolSteps).toBe(6)
    expect(settings).toEqual({ maxToolSteps: 6, nextActionLimit: 2, orchestrationInstructions: "Use saved context." })
  })

  it("builds orchestrator instructions without legacy specialist notes", () => {
    const instructions = runtimeInstructions(defaultDirectorRuntimeSettings)
    expect(instructions).not.toContain("Active specialist instructions:")
    expect(instructions).toContain("FAILURE RECOVERY")
    expect(instructions).toContain("Offer no more than 3 contextual next actions")
  })
})
