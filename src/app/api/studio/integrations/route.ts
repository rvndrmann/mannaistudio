import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listCredentials } from "@/lib/byok/credential-service"
import { byokIsConfigured } from "@/lib/byok/kms"
import { byokProviders, providerSpecs } from "@/lib/byok/providers"

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
