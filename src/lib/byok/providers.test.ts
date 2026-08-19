import { describe, expect, it } from "vitest"
import { assertAllowedProviderUrl, byokProviders, credentialSchemaFor, isAllowedProviderUrl, primaryPartKey, providerSpecs } from "./providers"

describe("where a credential may be sent", () => {
  it("allows each provider's own API host over HTTPS", () => {
    expect(isAllowedProviderUrl("openai", "https://api.openai.com/v1/images/generations")).toBe(true)
    expect(isAllowedProviderUrl("gemini", "https://generativelanguage.googleapis.com/v1beta/models")).toBe(true)
    expect(isAllowedProviderUrl("byteplus", "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations")).toBe(true)
    expect(isAllowedProviderUrl("byteplus", "https://open.byteplusapi.com/")).toBe(true)
  })

  it("refuses a lookalike host that merely ends with the real one", () => {
    // The single mistake that turns an allowlist into an attack: endsWith.
    expect(isAllowedProviderUrl("openai", "https://api.openai.com.evil.tld/v1")).toBe(false)
    expect(isAllowedProviderUrl("openai", "https://evil.tld/api.openai.com")).toBe(false)
    expect(isAllowedProviderUrl("openai", "https://notapi.openai.com/v1")).toBe(false)
  })

  it("refuses another provider's host", () => {
    expect(isAllowedProviderUrl("openai", "https://generativelanguage.googleapis.com/v1beta")).toBe(false)
  })

  it("refuses plaintext, loopback and internal metadata addresses", () => {
    expect(isAllowedProviderUrl("openai", "http://api.openai.com/v1")).toBe(false)
    expect(isAllowedProviderUrl("openai", "https://127.0.0.1/v1")).toBe(false)
    expect(isAllowedProviderUrl("openai", "https://169.254.169.254/latest/meta-data/")).toBe(false)
    expect(isAllowedProviderUrl("openai", "https://localhost:3000/v1")).toBe(false)
  })

  it("refuses nonsense rather than throwing", () => {
    expect(isAllowedProviderUrl("openai", "")).toBe(false)
    expect(isAllowedProviderUrl("openai", "not a url")).toBe(false)
    expect(isAllowedProviderUrl("openai", "file:///etc/passwd")).toBe(false)
  })

  it("throws without repeating the URL, which may carry a token", () => {
    const bad = "https://evil.tld/steal?token=sk-live-secret"
    expect(() => assertAllowedProviderUrl("openai", bad)).toThrow(/allowlist/i)
    try {
      assertAllowedProviderUrl("openai", bad)
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-live-secret")
      expect((error as Error).message).not.toContain("evil.tld")
    }
  })
})

describe("what each provider is asked for", () => {
  it("asks BytePlus for the Asset Library parts too, because character shots need them", () => {
    const keys = providerSpecs.byteplus.parts.map((part) => part.key)
    expect(keys).toEqual(["arkApiKey", "accessKey", "secretKey", "assetGroupId"])
    expect(primaryPartKey("byteplus")).toBe("arkApiKey")
  })

  it("validates a complete BytePlus credential and rejects a partial one", () => {
    const schema = credentialSchemaFor("byteplus")
    expect(schema.safeParse({
      arkApiKey: "ark-abcdefghijklmnop",
      accessKey: "AKLTaccesskeyvalue01",
      secretKey: "c2VjcmV0a2V5dmFsdWU=",
    }).success).toBe(true)
    expect(schema.safeParse({ arkApiKey: "ark-abcdefghijklmnop" }).success).toBe(false)
    expect(schema.safeParse({ arkApiKey: "short" }).success).toBe(false)
  })

  it("refuses unknown fields, so nothing rides along into the vault", () => {
    const schema = credentialSchemaFor("openai")
    expect(schema.safeParse({ apiKey: "sk-abcdefghijklmnop", baseUrl: "https://evil.tld" }).success).toBe(false)
  })

  it("gives every provider at least one host and one part", () => {
    for (const provider of byokProviders) {
      const spec = providerSpecs[provider]
      expect(spec.allowedHosts.length).toBeGreaterThan(0)
      expect(spec.parts.length).toBeGreaterThan(0)
      for (const host of spec.allowedHosts) expect(host).not.toContain("*")
    }
  })
})
