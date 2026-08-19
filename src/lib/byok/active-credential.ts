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

type ActiveCredential = { provider: ByokProvider; parts: CredentialParts }

const storage = new AsyncLocalStorage<ActiveCredential>()

/** Runs `work` with this credential in force for everything it awaits. */
export function runWithCredential<T>(provider: ByokProvider, parts: CredentialParts, work: () => Promise<T>): Promise<T> {
  return storage.run({ provider, parts }, work)
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
  if (!active || active.provider !== provider) return undefined
  const value = active.parts[part]
  return value && value.trim() ? value : undefined
}

/** Whether a customer credential is serving the current work. */
export function isRunningOnCustomerKey(provider: ByokProvider): boolean {
  const active = storage.getStore()
  return Boolean(active && active.provider === provider)
}
