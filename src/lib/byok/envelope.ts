import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Envelope encryption for stored provider credentials.
 *
 * The credential is encrypted with a Data Encryption Key generated fresh for
 * every save, and that DEK is then wrapped by a key held in Google Cloud KMS.
 * The database stores the ciphertext and the wrapped DEK; it never stores the
 * DEK itself. So a dump of Supabase decrypts to nothing without a KMS unwrap
 * that only the credential service's service account can ask for, which is the
 * property the whole design exists to hold.
 *
 * AES-256-GCM is authenticated: a tampered ciphertext, nonce or tag fails to
 * decrypt rather than returning wrong plaintext. That matters here because the
 * plaintext is handed straight to a provider as an Authorization header.
 *
 * This module knows nothing about providers, HTTP or Supabase. The wrap and
 * unwrap of the DEK are injected, so the crypto is testable without reaching a
 * cloud, and so rotating to a different KMS is a change of one adapter.
 */

const ALGORITHM = "aes-256-gcm"
const DEK_BYTES = 32
const NONCE_BYTES = 12

/** The current scheme. Stored per row so a rotation can find what to re-wrap. */
export const ENCRYPTION_VERSION = 1

export type KeyWrapper = {
  /** Encrypts a raw DEK with the KMS key. */
  wrap(dek: Buffer): Promise<{ wrapped: Buffer; keyVersion?: string }>
  /** Decrypts a wrapped DEK. Must fail rather than return garbage. */
  unwrap(wrapped: Buffer): Promise<Buffer>
}

export type SealedCredential = {
  encryptedSecret: Buffer
  encryptedDek: Buffer
  nonce: Buffer
  authTag: Buffer
  encryptionVersion: number
  kmsKeyVersion?: string
}

/**
 * A credential's parts, before encryption.
 *
 * An object rather than a string because providers do not agree on what a
 * credential is: OpenAI is one bearer token, while BytePlus needs an ARK API
 * key for generation plus an access/secret pair and an asset group id for the
 * Asset Library. Sealing the whole object keeps every part under the same DEK
 * and the same authentication tag.
 */
export type CredentialParts = Record<string, string>

export async function sealCredential(parts: CredentialParts, wrapper: KeyWrapper): Promise<SealedCredential> {
  assertParts(parts)
  const dek = randomBytes(DEK_BYTES)
  const nonce = randomBytes(NONCE_BYTES)
  try {
    const cipher = createCipheriv(ALGORITHM, dek, nonce)
    const encryptedSecret = Buffer.concat([
      cipher.update(JSON.stringify(parts), "utf8"),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    const { wrapped, keyVersion } = await wrapper.wrap(dek)
    return {
      encryptedSecret,
      encryptedDek: wrapped,
      nonce,
      authTag,
      encryptionVersion: ENCRYPTION_VERSION,
      kmsKeyVersion: keyVersion,
    }
  } finally {
    // The plaintext DEK has no reason to outlive this call. Node may still hold
    // copies the language will not let us reach, but leaving this one readable
    // is a choice we do not have to make.
    dek.fill(0)
  }
}

export async function openCredential(sealed: SealedCredential, wrapper: KeyWrapper): Promise<CredentialParts> {
  if (sealed.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported credential encryption version ${sealed.encryptionVersion}`)
  }
  const dek = await wrapper.unwrap(sealed.encryptedDek)
  try {
    if (dek.length !== DEK_BYTES) throw new Error("Unwrapped key has the wrong length")
    const decipher = createDecipheriv(ALGORITHM, dek, sealed.nonce)
    decipher.setAuthTag(sealed.authTag)
    const plaintext = Buffer.concat([
      decipher.update(sealed.encryptedSecret),
      decipher.final(),
    ])
    const parsed = JSON.parse(plaintext.toString("utf8")) as CredentialParts
    assertParts(parsed)
    return parsed
  } finally {
    dek.fill(0)
  }
}

/**
 * The last four characters, which is all the UI is ever told about a key.
 *
 * Short secrets are masked entirely rather than mostly revealed — four of six
 * characters is not a hint, it is most of the key.
 */
export function keyLast4(secret: string): string {
  const trimmed = secret.trim()
  return trimmed.length >= 12 ? trimmed.slice(-4) : ""
}

function assertParts(parts: unknown): asserts parts is CredentialParts {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) {
    throw new Error("Credential parts must be an object")
  }
  const entries = Object.entries(parts as Record<string, unknown>)
  if (!entries.length) throw new Error("Credential has no parts")
  for (const [key, value] of entries) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Credential part "${key}" must be a non-empty string`)
    }
  }
}
