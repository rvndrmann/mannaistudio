import "server-only"
import type { KeyWrapper } from "./envelope"

/**
 * Google Cloud KMS as the key wrapper, over the REST API.
 *
 * Only the data encryption key is ever sent to Google — never the customer's
 * provider credential, which is encrypted locally before this is called. So the
 * secret itself does not leave the process, and the thing that can decrypt it
 * does not live in the database.
 *
 * This talks to KMS with `fetch` and Web Crypto rather than through
 * @google-cloud/kms, and that is deliberate. BYOK is the product, so it has to
 * work wherever a turn runs — and a turn is moving to a Deno runtime, where the
 * Node client library does not go. Two implementations of key unwrapping would
 * be two chances to get key handling subtly different from each other. This one
 * runs unmodified on both.
 *
 * `server-only` is imported for its build-time effect: if this module is ever
 * pulled into a client bundle the build fails rather than shipping a path to
 * the service account credentials. The Deno bundle aliases it to nothing, which
 * is the correct reading of it there — there is no client bundle to guard.
 */

const KMS_SCOPE = "https://www.googleapis.com/auth/cloudkms"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const KMS_ENDPOINT = "https://cloudkms.googleapis.com/v1"

/** Reads configuration from whichever runtime this is. */
function env(name: string): string | undefined {
  const fromNode = typeof process !== "undefined" ? process.env?.[name] : undefined
  if (fromNode) return fromNode
  const denoEnv = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno?.env
  return denoEnv?.get(name)
}

type ServiceAccount = { client_email: string; private_key: string; project_id?: string }

function serviceAccount(): ServiceAccount {
  const raw = env("GOOGLE_KMS_SERVICE_ACCOUNT_JSON")
  if (!raw) {
    throw new Error(
      "Cloud KMS has no credentials on this server. Set GOOGLE_KMS_SERVICE_ACCOUNT_JSON to the service account key.",
    )
  }
  let parsed: Partial<ServiceAccount>
  try {
    parsed = JSON.parse(raw)
  } catch {
    // The message names the variable and nothing else. A parse error that
    // echoed the value would put a private key in the logs.
    throw new Error("GOOGLE_KMS_SERVICE_ACCOUNT_JSON is not valid JSON")
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_KMS_SERVICE_ACCOUNT_JSON is missing client_email or private_key")
  }
  return parsed as ServiceAccount
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The PEM body of a PKCS#8 private key, as the bytes Web Crypto imports. */
function pkcs8Bytes(privateKey: string): Uint8Array {
  const body = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  return fromBase64(body)
}

/**
 * An access token for the KMS scope, cached until shortly before it expires.
 *
 * Cached because unwrapping happens on every generation that runs on a
 * customer's key, and minting a token per unwrap would add a round trip to
 * Google in front of each one. Refreshed early rather than on failure, so a
 * token expiring mid-request is not a customer's generation failing.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const account = serviceAccount()
  const issuedAt = Math.floor(Date.now() / 1000)
  const claims = {
    iss: account.client_email,
    scope: KMS_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }
  const encoder = new TextEncoder()
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))
  const payload = base64url(encoder.encode(JSON.stringify(claims)))
  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Bytes(account.private_key).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput)),
  )
  const assertion = `${signingInput}.${base64url(signature)}`

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  if (!response.ok) {
    // The body can name the problem (a clock skew, a disabled account) without
    // containing anything secret — the assertion is not echoed back.
    throw new Error(`Cloud KMS sign-in failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
  const token = await response.json() as { access_token?: string; expires_in?: number }
  if (!token.access_token) throw new Error("Cloud KMS sign-in returned no access token")
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

/** Turns a KMS failure into something that names the missing setting. */
function describeKmsFailure(status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      "The KMS service account cannot use this key. Grant it roles/cloudkms.cryptoKeyEncrypterDecrypter on the configured key.",
    )
  }
  if (status === 404) {
    return new Error("The configured KMS key was not found. Check GOOGLE_KMS_PROJECT_ID, LOCATION, KEY_RING and KEY_NAME.")
  }
  return new Error(`Cloud KMS request failed (${status}): ${body.slice(0, 300)}`)
}

/**
 * The key to wrap with, composed from the four parts the deployment sets:
 * projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}
 *
 * Composed rather than pasted whole because that is how the key is described in
 * the console and in the environment — one variable per part, each readable on
 * its own. A full resource path is still accepted in GOOGLE_KMS_KEY_NAME, so
 * setting it that way is not a silent misconfiguration.
 */
function cryptoKeyName() {
  const key = env("GOOGLE_KMS_KEY_NAME")?.trim()
  if (!key) {
    throw new Error("BYOK is not configured: GOOGLE_KMS_KEY_NAME is missing from the server environment.")
  }
  if (key.startsWith("projects/")) {
    if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(key)) {
      throw new Error("GOOGLE_KMS_KEY_NAME looks like a resource path but is not a complete one.")
    }
    return key
  }

  const project = env("GOOGLE_KMS_PROJECT_ID")?.trim()
  const location = env("GOOGLE_KMS_LOCATION")?.trim()
  const ring = env("GOOGLE_KMS_KEY_RING")?.trim()
  const missing = [
    !project && "GOOGLE_KMS_PROJECT_ID",
    !location && "GOOGLE_KMS_LOCATION",
    !ring && "GOOGLE_KMS_KEY_RING",
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`BYOK is not configured: ${missing.join(", ")} missing from the server environment.`)
  }
  return `projects/${project}/locations/${location}/keyRings/${ring}/cryptoKeys/${key}`
}

/**
 * Whether the server is configured to store credentials at all.
 *
 * Every part must be present, because a half-configured deployment would accept
 * a customer's key on the way in and then fail to unwrap it at generation time
 * — the worst moment to discover it.
 */
export function byokIsConfigured() {
  const key = env("GOOGLE_KMS_KEY_NAME")?.trim()
  if (!key) return false
  if (key.startsWith("projects/")) return true
  return Boolean(
    env("GOOGLE_KMS_PROJECT_ID")?.trim()
    && env("GOOGLE_KMS_LOCATION")?.trim()
    && env("GOOGLE_KMS_KEY_RING")?.trim(),
  )
}

async function kmsCall(operation: "encrypt" | "decrypt", payload: Record<string, string>) {
  const name = cryptoKeyName()
  const response = await fetch(`${KMS_ENDPOINT}/${name}:${operation}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw describeKmsFailure(response.status, await response.text())
  return await response.json() as { ciphertext?: string; plaintext?: string; name?: string }
}

export function kmsKeyWrapper(): KeyWrapper {
  return {
    async wrap(dek) {
      const result = await kmsCall("encrypt", { plaintext: toBase64(new Uint8Array(dek)) })
      if (!result.ciphertext) throw new Error("KMS returned no ciphertext for the data key")
      return {
        wrapped: Buffer.from(fromBase64(result.ciphertext)),
        // Which key version wrapped it, so a rotation can find the rows that
        // still point at the old one.
        keyVersion: result.name || undefined,
      }
    },
    async unwrap(wrapped) {
      const result = await kmsCall("decrypt", { ciphertext: toBase64(new Uint8Array(wrapped)) })
      if (!result.plaintext) throw new Error("KMS returned no plaintext for the wrapped data key")
      return Buffer.from(fromBase64(result.plaintext))
    },
  }
}
