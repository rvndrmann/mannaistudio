import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { byokIsConfigured, kmsKeyWrapper } from "./kms"

/**
 * A real round trip against the configured Cloud KMS key.
 *
 * Skipped unless RUN_KMS_LIVE is set, because it needs the service account and
 * the network — but it is the only thing that actually proves a customer's key
 * can be sealed and opened again, which is the whole of BYOK. Run it after any
 * change to the wrapper:
 *
 *   RUN_KMS_LIVE=1 npx vitest run src/lib/byok/kms-live.manual.test.ts
 */
const live = process.env.RUN_KMS_LIVE ? describe : describe.skip

live("Cloud KMS, for real", () => {
  it("is configured on this environment", () => {
    expect(byokIsConfigured()).toBe(true)
  })

  it("wraps a data key and gives back exactly the same bytes", async () => {
    const wrapper = kmsKeyWrapper()
    const dek = randomBytes(32)
    const { wrapped, keyVersion } = await wrapper.wrap(dek)
    expect(wrapped.length).toBeGreaterThan(0)
    expect(keyVersion).toContain("cryptoKeyVersions")
    const opened = await wrapper.unwrap(wrapped)
    expect(Buffer.compare(dek, opened)).toBe(0)
  }, 30_000)

  it("refuses a wrapped key that was tampered with", async () => {
    const wrapper = kmsKeyWrapper()
    const { wrapped } = await wrapper.wrap(randomBytes(32))
    const tampered = Buffer.from(wrapped)
    tampered[tampered.length - 1] ^= 0xff
    await expect(wrapper.unwrap(tampered)).rejects.toThrow()
  }, 30_000)
})
