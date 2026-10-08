import { AsyncLocalStorage } from "node:async_hooks"
import type { CredentialParts } from "./envelope"
import type { ByokProvider } from "./providers"

/**
 * The credential in force for the current piece of work.
 *
 * The provider modules read their keys from the environment in a dozen places —
 * generation, the Asset Library signer, asset create/get/delete. Threading a
 * credential argument through all of them means every call site is a chance to
 * forget one, and a forgotten one does not fail: it quietly falls back to the
 * platform's key, so the customer's generation is billed to us and the whole
 * feature is wrong in the direction nobody notices.
 *
 * So the credential is carried in async-local storage for the duration of one
 * job, and the provider modules consult it at the single point where they used
 * to read `process.env`. A call outside any scope behaves exactly as it did
 * before, which is what keeps the platform-paid path untouched.
 *
 * This is server-only by construction: `node:async_hooks` does not exist in the
 * browser or on the edge runtime.
 */

type ActiveCredential = { provider: ByokProvider; parts: CredentialParts; credentialId?: string }

const storage = new AsyncLocalStorage<ActiveCredential>()

/** Runs `work` with this credential in force for everything it awaits. */
export function runWithCredential<T>(provider: ByokProvider, parts: CredentialParts, work: () => Promise<T>, credentialId?: string): Promise<T> {
  const parent = storage.getStore()
  return storage.run({ provider, parts, credentialId: credentialId || (parent?.provider === provider ? parent.credentialId : undefined) }, work)
}

/**
 * The part of the active credential for this provider, or undefined to mean
 * "use the platform's own key".
 *
 * Checking the provider matters: an OpenAI credential being in force must not
 * satisfy a BytePlus key lookup, or a mismatched key gets sent to the wrong
 * host and the failure looks like a bad customer key.
 */
export function activeCredentialPart(provider: ByokProvider, part: string): string | undefined {
  const active = storage.getStore()
  if (!active) return undefined
  if (active.provider !== provider) throw new Error(`Connect a ${provider} key for this operation; platform fallback is prohibited during BYOK.`)
  const value = active.parts[part]
  if (value && value.trim()) return value
  if (provider === "byteplus" && part === "assetGroupId") return undefined
  throw new Error(`Your ${provider} credential is missing ${part}; platform fallback is prohibited.`)
}

/** Whether a customer credential is serving the current work. */
export function isRunningOnCustomerKey(provider: ByokProvider): boolean {
  const active = storage.getStore()
  return Boolean(active && active.provider === provider)
}

/** Non-secret vault identity, used to keep provider asset registries separate. */
export function activeCredentialId(provider: ByokProvider): string | undefined {
  const active = storage.getStore()
  return active?.provider === provider ? active.credentialId : undefined
}
