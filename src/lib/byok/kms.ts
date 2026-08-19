import "server-only"
import { KeyManagementServiceClient } from "@google-cloud/kms"
import type { KeyWrapper } from "./envelope"

/**
 * Google Cloud KMS as the key wrapper.
 *
 * Only the data encryption key is ever sent to Google — never the customer's
 * provider credential, which is encrypted locally before this is called. So the
 * secret itself does not leave the process, and the thing that can decrypt it
 * does not live in the database.
 *
 * `server-only` is imported for its build-time effect: if this module is ever
 * pulled into a client bundle the build fails rather than shipping a path to
 * the service account credentials.
 */

let client: KeyManagementServiceClient | null = null

function kmsClient() {
  if (client) return client
  // Two ways to authenticate, because they suit different hosts. Netlify has no
  // filesystem to leave a key file on, so the JSON travels as one env var;
  // Cloud Run and a developer's machine use application default credentials.
  const inlineCredentials = process.env.GOOGLE_KMS_SERVICE_ACCOUNT_JSON
  if (inlineCredentials) {
    let parsed: { client_email?: string; private_key?: string; project_id?: string }
    try {
      parsed = JSON.parse(inlineCredentials)
    } catch {
      // The message names the variable and nothing else. A parse error that
      // echoed the value would put a private key in the logs.
      throw new Error("GOOGLE_KMS_SERVICE_ACCOUNT_JSON is not valid JSON")
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GOOGLE_KMS_SERVICE_ACCOUNT_JSON is missing client_email or private_key")
    }
    client = new KeyManagementServiceClient({
      credentials: { client_email: parsed.client_email, private_key: parsed.private_key },
      projectId: parsed.project_id,
    })
    return client
  }
  client = new KeyManagementServiceClient()
  return client
}

/**
 * The key to wrap with, composed from the four parts the deployment sets:
 * projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}
 *
 * Composed rather than pasted whole because that is how the key is described in
 * the console and in the Netlify environment — one variable per part, each
 * readable on its own. A full resource path is still accepted in
 * GOOGLE_KMS_KEY_NAME, so setting it that way is not a silent misconfiguration.
 */
function cryptoKeyName() {
  const key = process.env.GOOGLE_KMS_KEY_NAME?.trim()
  if (!key) {
    throw new Error("BYOK is not configured: GOOGLE_KMS_KEY_NAME is missing from the server environment.")
  }
  if (key.startsWith("projects/")) {
    if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(key)) {
      throw new Error("GOOGLE_KMS_KEY_NAME looks like a resource path but is not a complete one.")
    }
    return key
  }

  const project = process.env.GOOGLE_KMS_PROJECT_ID?.trim()
  const location = process.env.GOOGLE_KMS_LOCATION?.trim()
  const ring = process.env.GOOGLE_KMS_KEY_RING?.trim()
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
  const key = process.env.GOOGLE_KMS_KEY_NAME?.trim()
  if (!key) return false
  if (key.startsWith("projects/")) return true
  return Boolean(
    process.env.GOOGLE_KMS_PROJECT_ID?.trim()
    && process.env.GOOGLE_KMS_LOCATION?.trim()
    && process.env.GOOGLE_KMS_KEY_RING?.trim(),
  )
}

export function kmsKeyWrapper(): KeyWrapper {
  return {
    async wrap(dek) {
      const name = cryptoKeyName()
      const [result] = await kmsClient().encrypt({ name, plaintext: dek })
      if (!result.ciphertext) throw new Error("KMS returned no ciphertext for the data key")
      return {
        wrapped: Buffer.from(result.ciphertext as Uint8Array),
        // Which key version wrapped it, so a rotation can find the rows that
        // still point at the old one.
        keyVersion: result.name || undefined,
      }
    },
    async unwrap(wrapped) {
      const name = cryptoKeyName()
      const [result] = await kmsClient().decrypt({ name, ciphertext: wrapped })
      if (!result.plaintext) throw new Error("KMS returned no plaintext for the wrapped data key")
      return Buffer.from(result.plaintext as Uint8Array)
    },
  }
}
