import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { byokIsConfigured } from "./kms"

/**
 * The deployment sets the key as four parts, the way the console describes it.
 * Getting this wrong is not a visible failure: a half-configured server accepts
 * a customer's key on the way in and then cannot unwrap it at generation time.
 */
const KEYS = ["GOOGLE_KMS_KEY_NAME", "GOOGLE_KMS_PROJECT_ID", "GOOGLE_KMS_LOCATION", "GOOGLE_KMS_KEY_RING"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => { for (const key of KEYS) { saved[key] = process.env[key]; delete process.env[key] } })
afterEach(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })

describe("whether BYOK is configured", () => {
  it("is off when nothing is set, so every endpoint declines rather than half-working", () => {
    expect(byokIsConfigured()).toBe(false)
  })

  it("is on with the four parts this deployment sets", () => {
    process.env.GOOGLE_KMS_PROJECT_ID = "mannaistudio"
    process.env.GOOGLE_KMS_LOCATION = "asia-northeast3"
    process.env.GOOGLE_KMS_KEY_RING = "aidirectorhub-byok"
    process.env.GOOGLE_KMS_KEY_NAME = "byok-master-key"
    expect(byokIsConfigured()).toBe(true)
  })

  it("stays off when the key is named but the ring is missing", () => {
    process.env.GOOGLE_KMS_KEY_NAME = "byok-master-key"
    process.env.GOOGLE_KMS_PROJECT_ID = "mannaistudio"
    process.env.GOOGLE_KMS_LOCATION = "asia-northeast3"
    expect(byokIsConfigured()).toBe(false)
  })

  it("also accepts a full resource path on its own", () => {
    process.env.GOOGLE_KMS_KEY_NAME = "projects/mannaistudio/locations/asia-northeast3/keyRings/aidirectorhub-byok/cryptoKeys/byok-master-key"
    expect(byokIsConfigured()).toBe(true)
  })
})
