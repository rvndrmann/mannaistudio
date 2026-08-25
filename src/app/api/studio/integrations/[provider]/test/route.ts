import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hasByokSubscription, recordCredentialEvent, withCredential } from "@/lib/byok/credential-service"
import { byokIsConfigured } from "@/lib/byok/kms"
import { isByokProvider } from "@/lib/byok/providers"
import { validateCredential } from "@/lib/byok/validate"
import { consumeCredentialRateLimit } from "@/lib/byok/rate-limit"

/**
 * Tests a stored credential server-side.
 *
 * The secret is decrypted, used for one cheap read against the provider, and
 * discarded inside withCredential. The response says whether it worked; it
 * never carries the key, the ciphertext, or the provider's raw error.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isByokProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 })
  if (!byokIsConfigured()) return NextResponse.json({ error: "BYOK is not enabled on this server." }, { status: 503 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await hasByokSubscription(user.id))) {
    return NextResponse.json({ error: "An active subscription is required to use your own API keys." }, { status: 403 })
  }

  const limited = await consumeCredentialRateLimit(user.id, request)
  if (limited) return limited

  const result = await withCredential({ userId: user.id, provider }, (parts) => validateCredential(provider, parts))
  if (!result) return NextResponse.json({ error: "No key is connected for this provider." }, { status: 404 })

  await recordCredentialEvent({
    userId: user.id,
    provider,
    event: result.ok ? "credential_test_succeeded" : "credential_test_failed",
    detail: result.ok ? {} : { status: result.status ?? null },
  })
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: result.reason }, { status: 400 })
}
