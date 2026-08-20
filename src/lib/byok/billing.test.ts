import { describe, expect, it } from "vitest"
import { decideBilling, failureNoteFor, isProviderOutOfCredit, outOfCreditOffer, OwnKeysOnlyError, refundableCredits } from "./billing"

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

describe("telling a spent provider account apart from a broken request", () => {
  it("recognises the shapes providers actually use", () => {
    expect(isProviderOutOfCredit(402, "Payment Required")).toBe(true)
    expect(isProviderOutOfCredit(429, "You exceeded your current quota, please check your plan and billing details")).toBe(true)
    expect(isProviderOutOfCredit(400, "Insufficient balance in your account")).toBe(true)
    expect(isProviderOutOfCredit(403, "insufficient_quota")).toBe(true)
  })

  it("leaves an ordinary failure alone", () => {
    // Offering to spend studio credits over an unrelated error would charge for
    // a generation that was going to fail either way.
    expect(isProviderOutOfCredit(400, "prompt contains a disallowed term")).toBe(false)
    expect(isProviderOutOfCredit(500, "internal error")).toBe(false)
    expect(isProviderOutOfCredit(null, "")).toBe(false)
  })

  it("names the provider in the offer, because that is where the top-up happens", () => {
    expect(outOfCreditOffer("byteplus")).toMatch(/byteplus/i)
    expect(outOfCreditOffer("byteplus")).toMatch(/studio credits instead/i)
  })
})

describe("running on your own keys only", () => {
  it("still uses a connected key, as it always did", () => {
    expect(decideBilling({ hasCredential: true, platformCredits: 12, ownKeysOnly: true, provider: "byteplus" }))
      .toEqual({ mode: "byok", credits: 0 })
  })

  it("refuses rather than quietly spending credits on a provider you have not connected", () => {
    // The whole point of the setting: the studio is the interface, and the
    // user's own accounts pay for everything that runs. Falling back to credits
    // here would be the one thing they asked it never to do.
    expect(() => decideBilling({ hasCredential: false, platformCredits: 12, ownKeysOnly: true, provider: "openai" }))
      .toThrow(OwnKeysOnlyError)
  })

  it("names the missing key and how to proceed", () => {
    try {
      decideBilling({ hasCredential: false, platformCredits: 12, ownKeysOnly: true, provider: "openai" })
    } catch (error) {
      expect((error as Error).message).toContain("openai")
      expect((error as Error).message).toMatch(/connect one|turn off/i)
    }
  })

  it("falls back to credits as normal when the setting is off", () => {
    expect(decideBilling({ hasCredential: false, platformCredits: 12, provider: "openai" }))
      .toEqual({ mode: "credits", credits: 12 })
  })
})

describe("how a refusal is reported over HTTP", () => {
  it("carries Payment Required rather than falling through to 500", () => {
    // Nothing has gone wrong: the user chose to run only on their own keys and
    // has not connected this one. A 500 gets retried by clients and pages
    // someone, and tells the person who set the option that we are broken.
    const error = new OwnKeysOnlyError("byteplus")
    expect(error.status).toBe(402)
  })

  it("still says which key is missing and how to proceed", () => {
    const error = new OwnKeysOnlyError("byteplus")
    expect(error.message).toContain("byteplus")
    expect(error.message).toMatch(/connect one|turn off/i)
  })
})
