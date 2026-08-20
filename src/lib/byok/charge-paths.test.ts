import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { byokProviderFor } from "./providers"

/**
 * Every path that can charge a user must ask who is paying first.
 *
 * There are three, written at different times, and only one of them asked. The
 * direct image and video routes billed straight from the rate card, so a user
 * who had connected their own key was charged anyway and rendered on the
 * platform account, and a user who had chosen "only my own keys" had credits
 * taken regardless. The setting looked enforced because the path everyone
 * tested — the Director's submit_generation — did enforce it.
 */
const CHARGE_PATHS = [
  "src/app/api/studio/projects/[projectId]/images/route.ts",
  "src/app/api/studio/projects/[projectId]/videos/route.ts",
  "src/lib/studio/tool-registry.ts",
  // The standalone generators. A new surface reaching a model is a new charge
  // path, and the reason this list is written down rather than inferred is that
  // adding one is exactly when the rule gets forgotten.
  "src/app/api/studio/generate/image/route.ts",
  "src/app/api/studio/generate/video/route.ts",
]

describe("every charge path asks who is paying", () => {
  for (const path of CHARGE_PATHS) {
    const source = readFileSync(join(process.cwd(), path), "utf8")

    it(`${path} decides billing before it deducts`, () => {
      expect(source).toContain("deductUserCredits")
      expect(source, `${path} charges without consulting decideBilling`).toContain("decideBilling")
    })

    it(`${path} honours only-my-own-keys`, () => {
      expect(source).toContain("ownKeysOnly")
    })

    it(`${path} records which account paid`, () => {
      // Written onto the job so the renderer and the refund path both know,
      // rather than inferring it later from whichever number is non-zero.
      expect(source).toContain("billing_mode")
    })
  }

  it("renders on the account that is paying", () => {
    // Billing that says "your key" while the render runs on ours is the failure
    // that costs money and reports nothing. The two direct routes call the
    // provider themselves; the Director's path hands off to execute-generation,
    // so that is where its scope lives.
    const rendering = [
      "src/app/api/studio/projects/[projectId]/images/route.ts",
      "src/app/api/studio/projects/[projectId]/videos/route.ts",
      "src/lib/studio/execute-generation.ts",
      "src/app/api/studio/generate/image/route.ts",
      "src/app/api/studio/generate/video/route.ts",
    ]
    for (const path of rendering) {
      const source = readFileSync(join(process.cwd(), path), "utf8")
      expect(source, `${path} calls a provider without entering the credential scope`).toContain("runWithCredential")
    }
  })
})

describe("provider names line up across the two catalogues", () => {
  it("maps Google's image models onto the Gemini credential", () => {
    // The generation catalogue says `google`; the credential is called
    // `gemini`. Compared directly, a connected key never matched, so it
    // silently charged credits and ran on the platform account.
    expect(byokProviderFor("google")).toBe("gemini")
  })

  it("passes through the names that already agree", () => {
    expect(byokProviderFor("byteplus")).toBe("byteplus")
    expect(byokProviderFor("fal")).toBe("fal")
    expect(byokProviderFor("openai")).toBe("openai")
  })

  it("returns nothing for a provider that cannot take a customer key", () => {
    expect(byokProviderFor("something-else")).toBeNull()
  })

  it("covers every provider the generation catalogue actually uses", () => {
    // A provider here with no BYOK mapping can never run on a customer key,
    // and under only-my-own-keys becomes unusable rather than merely billed.
    const models = readFileSync(join(process.cwd(), "src/lib/studio/generation-models.ts"), "utf8")
    const providers = Array.from(new Set(Array.from(models.matchAll(/provider: "([a-z]+)"/g)).map((m) => m[1])))
    expect(providers.length).toBeGreaterThan(0)
    for (const provider of providers) {
      expect(byokProviderFor(provider), `${provider} has no BYOK mapping`).not.toBeNull()
    }
  })
})

describe("no refund path can hand back credits that were never taken", () => {
  it("reads the recorded billing mode instead of guessing from two numbers", () => {
    // `credits_used || estimated_credits` is correct only while every job
    // charges. A BYOK job has credits_used of zero, so it falls through to the
    // estimate and refunds money nobody paid — repeat a failing generation and
    // it prints credits. Every refund site had its own copy of this.
    const refundSites = [
      "src/lib/studio/execute-generation.ts",
      "src/app/api/studio/projects/[projectId]/images/route.ts",
      "src/app/api/studio/projects/[projectId]/videos/route.ts",
      "src/app/api/studio/generate/image/route.ts",
      "src/app/api/studio/generate/video/route.ts",
    ]
    for (const path of refundSites) {
      const source = readFileSync(join(process.cwd(), path), "utf8")
      expect(source, `${path} refunds without checking who paid`).toContain("refundableCredits")
      expect(source, `${path} still guesses the refund from estimated_credits`)
        .not.toMatch(/credits_used \|\| job\.estimated_credits/)
    }
  })
})
