import { afterEach, expect, it, vi } from "vitest"
import { runWithCredential } from "./active-credential"
import { credentialSchemaFor, byokProviderFor } from "./providers"
import { requireHiggsfieldCredentials } from "@/lib/studio/higgsfield"
import { validateCredential } from "./validate"
afterEach(() => vi.unstubAllEnvs())
it("uses the customer key rather than the platform key", async () => {
  vi.stubEnv("HF_CREDENTIALS", "platform-id:platform-secret")
  await runWithCredential("higgsfield", { apiKey: "customer-id:customer-secret" }, async () => {
    expect(requireHiggsfieldCredentials()).toBe("customer-id:customer-secret")
  })
})
it("cannot fall back to the platform when the customer key is missing", async () => {
  vi.stubEnv("HF_CREDENTIALS", "platform-id:platform-secret")
  await expect(runWithCredential("higgsfield", {}, async () => requireHiggsfieldCredentials())).rejects.toThrow("fallback is prohibited")
})
it("requires a complete Higgsfield key and maps Higgsfield to BYOK", () => {
  expect(byokProviderFor("higgsfield")).toBe("higgsfield")
  expect(credentialSchemaFor("higgsfield").safeParse({ apiKey: "customer-id:customer-secret" }).success).toBe(true)
  expect(credentialSchemaFor("higgsfield").safeParse({ apiKey: "only-a-key-id" }).success).toBe(false)
})
it("validates by authenticated read without generating media", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
  try {
    expect(await validateCredential("higgsfield", { apiKey: "customer-id:customer-secret" })).toEqual({ ok: true })
    expect(request).toHaveBeenCalledWith(expect.stringContaining("api.higgsfield.ai/"), expect.objectContaining({ method: "GET", headers: { Authorization: "Key customer-id:customer-secret" } }))
  } finally { request.mockRestore() }
})
