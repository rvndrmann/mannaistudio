import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hasByokSubscription, listCredentials } from "@/lib/byok/credential-service"
import { byokIsConfigured } from "@/lib/byok/kms"
import { byokProviders, providerSpecs } from "@/lib/byok/providers"
import { ownKeysOnly, setOwnKeysOnly } from "@/lib/byok/preferences"

/**
 * What the browser is allowed to know about connected credentials.
 *
 * Metadata only: which provider, whether it is connected, a label, the last
 * four characters and some timestamps. There is no endpoint anywhere that
 * returns a stored secret, or the ciphertext, and there is no "reveal key"
 * feature to build one for.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await hasByokSubscription(user.id))) {
      return NextResponse.json({
        configured: byokIsConfigured(),
        subscriptionRequired: true,
        vaultReadable: true,
        ownKeysOnly: false,
        providers: [],
      })
    }

    // Which providers exist is static configuration; which are connected comes
    // from the vault. Losing the second must not hide the first — an opaque
    // failure here showed a page with no providers at all, which reads as "this
    // studio supports nothing" rather than "we could not reach the vault".
    let saved: Awaited<ReturnType<typeof listCredentials>> = []
    let vaultReadable = true
    try {
      saved = await listCredentials(user.id)
    } catch (error) {
      vaultReadable = false
      console.error("Could not read the credential vault:", error instanceof Error ? error.message : "unknown")
    }
    const byProvider = new Map(saved.map((entry) => [entry.provider, entry]))

    return NextResponse.json({
      configured: byokIsConfigured(),
      vaultReadable,
      ownKeysOnly: await ownKeysOnly(user.id).catch(() => false),
      providers: byokProviders.map((provider) => {
        const spec = providerSpecs[provider]
        const credential = byProvider.get(provider)
        return {
          provider,
          label: spec.label,
          helpUrl: spec.helpUrl,
          parts: spec.parts.map(({ key, label, hint, optional }) => ({ key, label, hint, optional: Boolean(optional) })),
          connected: Boolean(credential),
          keyLabel: credential?.label ?? null,
          last4: credential?.last4 ?? null,
          status: credential?.status ?? null,
          connectedAt: credential?.createdAt ?? null,
          lastUsedAt: credential?.lastUsedAt ?? null,
        }
      }),
    })
  } catch (error) {
    console.error("Could not list integrations:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Could not load integrations" }, { status: 500 })
  }
}

/**
 * Turns "only my own keys" on or off.
 *
 * With it on the studio refuses a provider the user has not connected rather
 * than spending credits for them, so it is a deliberate act with a clear
 * consequence — hence its own call rather than a side effect of saving a key.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await hasByokSubscription(user.id))) {
      return NextResponse.json({ error: "An active subscription is required to use your own API keys." }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as { ownKeysOnly?: unknown } | null
    if (typeof body?.ownKeysOnly !== "boolean") {
      return NextResponse.json({ error: "ownKeysOnly must be true or false" }, { status: 400 })
    }
    await setOwnKeysOnly(user.id, body.ownKeysOnly)
    return NextResponse.json({ ownKeysOnly: body.ownKeysOnly })
  } catch (error) {
    console.error("Could not update the own-keys setting:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Could not save that setting" }, { status: 500 })
  }
}
