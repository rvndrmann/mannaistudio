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

/**
 * The vault is reached through SECURITY DEFINER functions, not through the
 * table.
 *
 * supabase-js speaks PostgREST, and PostgREST exposes only the schemas it is
 * configured for — `byok` is deliberately not one of them, which is what makes
 * the tables unreachable from a browser. That applies to the service role too.
 * Exposing the schema would have fixed the symptom and given away the property.
 * These functions are the whole surface instead, and execute on them is granted
 * to service_role alone.
 */
function vault() {
  return createServiceClient()
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
    await vault().rpc("byok_record_event", {
      p_user: input.userId,
      p_provider: input.provider ?? null,
      p_credential_id: input.credentialId ?? null,
      p_event: input.event,
      // Callers pass counts, reasons and ids. Never a secret, and never a raw
      // provider response, which can echo the request that carried one.
      p_detail: input.detail ?? {},
    })
  } catch (error) {
    // An audit write must never take down the operation it is describing.
    console.warn("Could not record credential event:", error instanceof Error ? error.message : "unknown")
  }
}

export async function listCredentials(userId: string): Promise<CredentialSummary[]> {
  if (!byokIsConfigured()) return []
  const { data, error } = await vault().rpc("byok_list_credentials", { p_user: userId })
  if (error) throw error
  type SummaryRow = { provider: string; key_label: string | null; key_last4: string | null; status: string; created_at: string; updated_at: string; last_used_at: string | null }
  return ((data || []) as SummaryRow[]).map((row) => ({
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
  const { data, error } = await vault().rpc("byok_has_credential", { p_user: userId, p_provider: provider })
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

  const { data, error } = await vault().rpc("byok_save_credential", {
    p_user: input.userId,
    p_provider: input.provider,
    // bytea travels as the hex form Postgres accepts; sending a raw array would
    // arrive as a JSON list of numbers and store the digits, not the bytes.
    p_encrypted_secret: toPostgresBytea(sealed.encryptedSecret),
    p_encrypted_dek: toPostgresBytea(sealed.encryptedDek),
    p_nonce: toPostgresBytea(sealed.nonce),
    p_auth_tag: toPostgresBytea(sealed.authTag),
    p_encryption_version: sealed.encryptionVersion,
    p_kms_key_version: sealed.kmsKeyVersion ?? null,
    p_key_last4: keyLast4(primary),
    p_key_label: input.label?.trim()?.slice(0, 120) || providerSpecs[input.provider].label,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  const replaced = Boolean(row?.replaced)
  await recordCredentialEvent({
    userId: input.userId,
    provider: input.provider,
    credentialId: row?.credential_id ?? null,
    event: replaced ? "credential_replaced" : "credential_connected",
  })
  return { replaced }
}

export async function deleteCredential(userId: string, provider: ByokProvider): Promise<boolean> {
  if (!byokIsConfigured()) return false
  const { data, error } = await vault().rpc("byok_delete_credential", { p_user: userId, p_provider: provider })
  if (error) throw error
  const removed = Number(data || 0) > 0
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
  const { data: rows, error } = await vault().rpc("byok_read_credential", { p_user: input.userId, p_provider: input.provider })
  if (error) throw error
  const data = Array.isArray(rows) ? rows[0] : rows
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
    await vault().rpc("byok_touch_credential", { p_credential_id: data.id })
    await recordCredentialEvent({ userId: input.userId, provider: input.provider, credentialId: data.id, event: "credential_used" })
    return result
  } finally {
    for (const key of Object.keys(parts)) parts[key] = ""
  }
}

/** Postgres accepts bytea as `\\xdeadbeef`; a JSON array would store digits. */
function toPostgresBytea(value: Buffer): string {
  return `\\x${value.toString("hex")}`
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
