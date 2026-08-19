import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import { keyLast4, openCredential, sealCredential, type CredentialParts } from "./envelope"
import { byokIsConfigured, kmsKeyWrapper } from "./kms"
import { primaryPartKey, providerSpecs, type ByokProvider } from "./providers"

/**
 * The only code that reads or writes the credential vault.
 *
 * Everything here derives ownership from a user id the caller has already
 * authenticated against a session — never from anything a browser sent. The
 * vault schema is not exposed through PostgREST, so the service-role client is
 * the only way in; that makes this module the whole attack surface, which is
 * the point of keeping it small.
 *
 * There is deliberately no function that returns a stored secret to a caller
 * outside this file's own use flow. Replacement is supported; retrieval is not.
 */

const CREDENTIALS = "provider_credentials"
const EVENTS = "credential_events"

function vault() {
  // `db: { schema }` keeps the private schema off the default search path used
  // by every other query in the app.
  return createServiceClient().schema("byok")
}

/** What the UI is allowed to know. Never any part of the secret. */
export type CredentialSummary = {
  provider: ByokProvider
  connected: true
  label: string | null
  last4: string | null
  status: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

export type CredentialEvent =
  | "credential_connected"
  | "credential_replaced"
  | "credential_test_succeeded"
  | "credential_test_failed"
  | "credential_used"
  | "credential_deleted"
  | "authorization_denied"
  | "suspicious_credential_activity"

export async function recordCredentialEvent(input: {
  userId: string | null
  provider?: string
  credentialId?: string | null
  event: CredentialEvent
  detail?: Record<string, unknown>
}) {
  try {
    await vault().from(EVENTS).insert({
      actor_user_id: input.userId,
      provider: input.provider ?? null,
      credential_id: input.credentialId ?? null,
      event: input.event,
      // Callers pass counts, reasons and ids. Never a secret, and never a raw
      // provider response, which can echo the request that carried one.
      detail: input.detail ?? {},
    })
  } catch (error) {
    // An audit write must never take down the operation it is describing.
    console.warn("Could not record credential event:", error instanceof Error ? error.message : "unknown")
  }
}

export async function listCredentials(userId: string): Promise<CredentialSummary[]> {
  if (!byokIsConfigured()) return []
  const { data, error } = await vault()
    .from(CREDENTIALS)
    .select("provider,key_label,key_last4,status,created_at,updated_at,last_used_at")
    .eq("owner_user_id", userId)
  if (error) throw error
  return (data || []).map((row) => ({
    provider: row.provider as ByokProvider,
    connected: true as const,
    label: row.key_label,
    last4: row.key_last4,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  }))
}

/** Whether this user has a usable credential for a provider. No secret involved. */
export async function hasCredential(userId: string, provider: ByokProvider): Promise<boolean> {
  if (!byokIsConfigured()) return false
  const { data, error } = await vault()
    .from(CREDENTIALS)
    .select("id")
    .eq("owner_user_id", userId)
    .eq("provider", provider)
    .eq("status", "active")
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function saveCredential(input: {
  userId: string
  provider: ByokProvider
  parts: CredentialParts
  label?: string | null
}): Promise<{ replaced: boolean }> {
  if (!byokIsConfigured()) throw new Error("BYOK is not configured on this server.")
  const sealed = await sealCredential(input.parts, kmsKeyWrapper())
  const primary = input.parts[primaryPartKey(input.provider)] || ""

  const { data: existing } = await vault()
    .from(CREDENTIALS)
    .select("id")
    .eq("owner_user_id", input.userId)
    .eq("provider", input.provider)
    .is("team_id", null)
    .maybeSingle()

  const row = {
    owner_user_id: input.userId,
    team_id: null,
    provider: input.provider,
    encrypted_secret: sealed.encryptedSecret,
    encrypted_dek: sealed.encryptedDek,
    nonce: sealed.nonce,
    auth_tag: sealed.authTag,
    encryption_version: sealed.encryptionVersion,
    kms_key_version: sealed.kmsKeyVersion ?? null,
    key_last4: keyLast4(primary),
    key_label: input.label?.trim()?.slice(0, 120) || providerSpecs[input.provider].label,
    status: "active",
    last_error: null,
  }

  if (existing) {
    const { error } = await vault().from(CREDENTIALS).update(row).eq("id", existing.id)
    if (error) throw error
    await recordCredentialEvent({ userId: input.userId, provider: input.provider, credentialId: existing.id, event: "credential_replaced" })
    return { replaced: true }
  }

  const { data: inserted, error } = await vault().from(CREDENTIALS).insert(row).select("id").single()
  if (error) throw error
  await recordCredentialEvent({ userId: input.userId, provider: input.provider, credentialId: inserted.id, event: "credential_connected" })
  return { replaced: false }
}

export async function deleteCredential(userId: string, provider: ByokProvider): Promise<boolean> {
  if (!byokIsConfigured()) return false
  const { data, error } = await vault()
    .from(CREDENTIALS)
    .delete()
    .eq("owner_user_id", userId)
    .eq("provider", provider)
    .select("id")
  if (error) throw error
  const removed = (data || []).length > 0
  if (removed) {
    await recordCredentialEvent({ userId, provider, event: "credential_deleted" })
  }
  return removed
}

/**
 * Decrypts a credential for one outbound provider call.
 *
 * The plaintext is handed to `use` and is not returned to the caller, so it
 * cannot escape into a response, a log line, a tool result or an agent's
 * context by accident — the shape of the function is the guarantee. Callers get
 * back only whatever their own callback returns.
 */
export async function withCredential<T>(
  input: { userId: string; provider: ByokProvider },
  use: (parts: CredentialParts) => Promise<T>,
): Promise<T | null> {
  if (!byokIsConfigured()) return null
  const { data, error } = await vault()
    .from(CREDENTIALS)
    .select("id,encrypted_secret,encrypted_dek,nonce,auth_tag,encryption_version")
    .eq("owner_user_id", input.userId)
    .eq("provider", input.provider)
    .eq("status", "active")
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const parts = await openCredential({
    encryptedSecret: toBuffer(data.encrypted_secret),
    encryptedDek: toBuffer(data.encrypted_dek),
    nonce: toBuffer(data.nonce),
    authTag: toBuffer(data.auth_tag),
    encryptionVersion: data.encryption_version,
  }, kmsKeyWrapper())

  try {
    const result = await use(parts)
    await vault().from(CREDENTIALS).update({ last_used_at: new Date().toISOString() }).eq("id", data.id)
    await recordCredentialEvent({ userId: input.userId, provider: input.provider, credentialId: data.id, event: "credential_used" })
    return result
  } finally {
    for (const key of Object.keys(parts)) parts[key] = ""
  }
}

/**
 * Supabase returns bytea as a hex string like `\x0a1b…` over the wire, and as a
 * Buffer when it is already one. Both have to arrive back as bytes or the
 * decrypt fails in a way that looks like tampering.
 */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === "string") {
    return value.startsWith("\\x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "base64")
  }
  throw new Error("Stored credential column is not readable as bytes")
}
