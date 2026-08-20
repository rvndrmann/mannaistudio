import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { byokProviders } from "./providers"

/**
 * Every provider offered for BYOK must actually honour the customer's key.
 *
 * This guards a hole that is invisible in every other test. Offering a provider
 * makes the billing decision treat a connected key as "the customer pays", so
 * credits are skipped — but if that provider's module still reads its key from
 * the environment, the generation runs on the platform's account. The customer
 * pays nothing, we pay for it, and nothing anywhere reports an error.
 *
 * So the list of providers a user can connect and the set of modules that read
 * the active credential have to agree, and this checks that they do.
 */

const STUDIO_DIR = join(process.cwd(), "src/lib/studio")

function providerModuleSources(): string {
  return readdirSync(STUDIO_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(STUDIO_DIR, name), "utf8"))
    .join("\n")
}

describe("every connectable provider honours the customer's key", () => {
  const sources = providerModuleSources()

  for (const provider of byokProviders) {
    it(`${provider} reads the active credential before falling back to the environment`, () => {
      // The call is what makes a connected key reach the provider. Without it,
      // connecting one silently grants free generation on the platform account.
      expect(sources).toContain(`activeCredentialPart("${provider}"`)
    })
  }

  it("offers no provider whose module has not been wired", () => {
    const wired = Array.from(sources.matchAll(/activeCredentialPart\("([a-z]+)"/g)).map((match) => match[1])
    for (const provider of byokProviders) {
      expect(wired).toContain(provider)
    }
  })
})

describe("the Director chat runs on the right account", () => {
  const chatRoute = readFileSync(
    join(process.cwd(), "src/app/api/studio/projects/[projectId]/director/chat/route.ts"),
    "utf8",
  )

  it("wraps the agent turn in the customer's credential scope", () => {
    // Without the scope the provider modules read the platform environment, so
    // every chat turn spends our budget — including for the customer paying
    // their own way for everything else, who is also the heaviest chat user.
    expect(chatRoute).toContain("runWithCredential")
    expect(chatRoute).toContain("chatModelProvider")
  })

  it("routes both agent call sites through the same helper", () => {
    // Two call sites, one streaming and one not. A scope applied to only one of
    // them is the half-fixed version that looks correct in testing.
    const direct = chatRoute.match(/runDirectorAgent\(/g) || []
    const wrapped = chatRoute.match(/runOnRightAccount\(/g) || []
    expect(direct.length).toBeGreaterThan(0)
    expect(wrapped.length).toBeGreaterThanOrEqual(direct.length)
  })

  it("honours only-my-own-keys for chat as well as generation", () => {
    // A setting that stops generation while the agent keeps running on us does
    // not mean what it says.
    expect(chatRoute).toContain("ownKeysOnly")
    expect(chatRoute).toContain("OwnKeysOnlyError")
  })
})
