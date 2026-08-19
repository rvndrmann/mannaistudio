import { describe, expect, it } from "vitest"
import { decideBilling, failureNoteFor, refundableCredits } from "./billing"

describe("who pays for a generation", () => {
  it("charges credits when the user has no key for the serving provider", () => {
    expect(decideBilling({ hasCredential: false, platformCredits: 12 })).toEqual({ mode: "credits", credits: 12 })
  })

  it("charges nothing when the user's own key serves it", () => {
    expect(decideBilling({ hasCredential: true, platformCredits: 12 })).toEqual({ mode: "byok", credits: 0 })
  })

  it("decides per provider, not per account", () => {
    // Connecting BytePlus does not make an OpenAI keyframe free: the decision
    // is about the provider that will actually serve this job.
    const openAiShot = decideBilling({ hasCredential: false, platformCredits: 12 })
    const bytePlusShot = decideBilling({ hasCredential: true, platformCredits: 12 })
    expect(openAiShot.mode).toBe("credits")
    expect(bytePlusShot.mode).toBe("byok")
  })
})

describe("what a failed job gives back", () => {
  it("refunds what was actually charged", () => {
    expect(refundableCredits({ billing_mode: "credits", credits_used: 12, estimated_credits: 12 })).toBe(12)
  })

  it("falls back to the estimate when the charge was never recorded", () => {
    expect(refundableCredits({ billing_mode: "credits", credits_used: 0, estimated_credits: 12 })).toBe(12)
  })

  it("refunds nothing for a job that ran on the user's own key", () => {
    // The bug this replaces: credits_used is 0 under BYOK, so a
    // `credits_used || estimated_credits` fallback refunded the estimate — and
    // a repeatedly failing BYOK generation minted credits.
    expect(refundableCredits({ billing_mode: "byok", credits_used: 0, estimated_credits: 12 })).toBe(0)
  })

  it("refunds nothing even if an estimate was recorded on a BYOK job", () => {
    expect(refundableCredits({ billing_mode: "byok", credits_used: 0, estimated_credits: 999 })).toBe(0)
  })

  it("treats a job with no recorded mode as the platform paying, which is what every existing row is", () => {
    expect(refundableCredits({ credits_used: 0, estimated_credits: 12 })).toBe(12)
    expect(refundableCredits({ billing_mode: null, credits_used: 8, estimated_credits: 12 })).toBe(8)
  })
})

describe("what the user is told when their own key fails", () => {
  it("says plainly that no refund is possible", () => {
    expect(failureNoteFor("byok")).toMatch(/no credits were taken/i)
  })

  it("says nothing extra when the platform paid, because the refund speaks for itself", () => {
    expect(failureNoteFor("credits")).toBeNull()
  })
})
