import { describe, expect, it } from "vitest"
import { activeCredentialId, activeCredentialPart, runWithCredential } from "./active-credential"

describe("credential scopes never fall back to platform credentials", () => {
  it("isolates concurrent provider credentials", async () => {
    const results = await Promise.all([
      runWithCredential("openai", { apiKey: "own-openai" }, async () => { await Promise.resolve(); return activeCredentialPart("openai", "apiKey") }),
      runWithCredential("fal", { apiKey: "own-fal" }, async () => activeCredentialPart("fal", "apiKey")),
    ])
    expect(results).toEqual(["own-openai", "own-fal"])
    expect(activeCredentialPart("openai", "apiKey")).toBeUndefined()
  })
  it("refuses a missing part rather than returning permission to use the environment", async () => {
    await expect(runWithCredential("openai", {}, async () => activeCredentialPart("openai", "apiKey"))).rejects.toThrow("platform fallback is prohibited")
  })
  it("refuses a different provider unless it has its own nested credential scope", async () => {
    await expect(runWithCredential("openai", { apiKey: "own" }, async () => activeCredentialPart("fal", "apiKey"))).rejects.toThrow("platform fallback is prohibited")
    const result = await runWithCredential("openai", { apiKey: "own" }, () => runWithCredential("fal", { apiKey: "own-fal" }, async () => activeCredentialPart("fal", "apiKey")))
    expect(result).toBe("own-fal")
  })
})


it("preserves vault identity through nested scopes for the same provider", async () => {
  const result = await runWithCredential("byteplus", { arkApiKey: "own" }, () => runWithCredential("byteplus", { arkApiKey: "own" }, async () => activeCredentialId("byteplus")), "credential-own")
  expect(result).toBe("credential-own")
})
