import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteCredential, recordCredentialEvent, saveCredential } from "@/lib/byok/credential-service"
import { byokIsConfigured } from "@/lib/byok/kms"
import { credentialSchemaFor, isByokProvider } from "@/lib/byok/providers"
import { validateCredential } from "@/lib/byok/validate"
import { consumeCredentialRateLimit } from "@/lib/byok/rate-limit"

/**
 * Saving, replacing and disconnecting a provider credential.
 *
 * The owner is always the authenticated session's user. Nothing here reads an
 * identity from the request body, so an id swapped by the caller cannot move
 * the write onto someone else's row.
 *
 * The request body carries a plaintext secret exactly once, on the way in. It
 * is never logged, never echoed back, and after encryption never persisted in
 * the clear.
 */

async function authorize(request: NextRequest, provider: string) {
  if (!isByokProvider(provider)) return { error: NextResponse.json({ error: "Unknown provider" }, { status: 404 }) } as const
  if (!byokIsConfigured()) return { error: NextResponse.json({ error: "BYOK is not enabled on this server." }, { status: 503 }) } as const
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const
  const limited = await consumeCredentialRateLimit(user.id, request)
  if (limited) return { error: limited } as const
  return { user, provider } as const
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    return await saveProviderCredential(request, await params)
  } catch (error) {
    // Anything thrown here reached the browser as a 500 with no body, and the
    // page called response.json() on it and crashed — so a misconfigured server
    // looked like a broken form. The message is deliberately generic: a KMS or
    // provider failure can name paths and credentials, and this string is both
    // shown and logged.
    console.error("Could not save a provider credential:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json(
      { error: "This key could not be saved. The server could not complete the encryption step — please try again, or contact support if it continues." },
      { status: 500 },
    )
  }
}

async function saveProviderCredential(request: NextRequest, { provider: raw }: { provider: string }) {
  const auth = await authorize(request, raw)
  if ("error" in auth) return auth.error
  const { user, provider } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const payload = body as { label?: unknown; parts?: unknown }
  const parsed = credentialSchemaFor(provider).safeParse(payload.parts)
  if (!parsed.success) {
    // The issues name fields and lengths, never values.
    const reason = parsed.error.issues.map((issue) => issue.message).join("; ")
    return NextResponse.json({ error: reason || "That credential is not in the expected shape." }, { status: 400 })
  }

  // Proven before stored: a key that does not work should not be sitting in the
  // vault waiting to fail during a generation the user is watching.
  // Zod widens optional fields to unknown; every value is a validated string.
  const parts = parsed.data as Record<string, string>
  const check = await validateCredential(provider, parts)
  if (!check.ok) {
    await recordCredentialEvent({ userId: user.id, provider, event: "credential_test_failed", detail: { status: check.status ?? null } })
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }

  const label = typeof payload.label === "string" ? payload.label : null
  const { replaced } = await saveCredential({ userId: user.id, provider, parts, label })
  return NextResponse.json({ connected: true, replaced })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: raw } = await params
    const auth = await authorize(request, raw)
    if ("error" in auth) return auth.error
    const removed = await deleteCredential(auth.user.id, auth.provider)
    return NextResponse.json({ disconnected: removed })
  } catch (error) {
    console.error("Could not disconnect a provider credential:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "That key could not be disconnected. Please try again." }, { status: 500 })
  }
}
