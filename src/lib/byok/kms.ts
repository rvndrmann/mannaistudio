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
  const inlineCredentials = process.env.GOOGLE_KMS_CREDENTIALS_JSON
  if (inlineCredentials) {
    let parsed: { client_email?: string; private_key?: string; project_id?: string }
    try {
      parsed = JSON.parse(inlineCredentials)
    } catch {
      throw new Error("GOOGLE_KMS_CREDENTIALS_JSON is not valid JSON")
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GOOGLE_KMS_CREDENTIALS_JSON is missing client_email or private_key")
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
 * The key to wrap with, as a full resource name:
 * projects/P/locations/L/keyRings/aidirectorhub-keyring/cryptoKeys/byok-credentials-key
 */
function cryptoKeyName() {
  const name = process.env.GOOGLE_KMS_KEY_NAME
  if (!name) {
    throw new Error("BYOK is not configured: GOOGLE_KMS_KEY_NAME is missing from the server environment.")
  }
  if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(name)) {
    throw new Error("GOOGLE_KMS_KEY_NAME must be a full KMS crypto key resource name.")
  }
  return name
}

/** Whether the server is configured to store credentials at all. */
export function byokIsConfigured() {
  return Boolean(process.env.GOOGLE_KMS_KEY_NAME)
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
