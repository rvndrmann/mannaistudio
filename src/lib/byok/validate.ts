import "server-only"
import type { CredentialParts } from "./envelope"
import { assertAllowedProviderUrl, type ByokProvider } from "./providers"

/**
 * Proves a credential works before it is stored, and again on demand.
 *
 * Always a cheap read — list the models, not generate anything — because a user
 * pressing "Test connection" should never be billed by their provider for it.
 *
 * Provider errors are never returned verbatim. An upstream service can echo the
 * request that failed, including the header that carried the key, so what
 * reaches the caller and the logs is a category and a status code.
 */

export type ValidationResult = { ok: true } | { ok: false; reason: string; status?: number }

const TIMEOUT_MS = 15_000

async function get(url: string, headers: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { method: "GET", headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Turns any upstream status into a message safe to show and to log. */
function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "The provider rejected this key. Check that it is active and has the right permissions."
  if (status === 429) return "The provider rate-limited the check. The key may be valid — try again shortly."
  if (status >= 500) return "The provider is unavailable right now. The key was not saved."
  return `The provider refused the check (HTTP ${status}).`
}

export async function validateCredential(provider: ByokProvider, parts: CredentialParts): Promise<ValidationResult> {
  try {
    switch (provider) {
      case "openai": {
        const url = "https://api.openai.com/v1/models"
        assertAllowedProviderUrl(provider, url)
        const response = await get(url, { Authorization: `Bearer ${parts.apiKey}` })
        return response.ok ? { ok: true } : { ok: false, reason: describeStatus(response.status), status: response.status }
      }
      case "gemini": {
        // The key travels as a header rather than a query parameter: a URL with
        // a secret in it lands in access logs at every hop.
        const url = "https://generativelanguage.googleapis.com/v1beta/models"
        assertAllowedProviderUrl(provider, url)
        const response = await get(url, { "x-goog-api-key": parts.apiKey })
        return response.ok ? { ok: true } : { ok: false, reason: describeStatus(response.status), status: response.status }
      }
      case "byteplus": {
        const url = "https://ark.ap-southeast.bytepluses.com/api/v3/models"
        assertAllowedProviderUrl(provider, url)
        const response = await get(url, { Authorization: `Bearer ${parts.arkApiKey}` })
        // ModelArk does not expose a models listing on every account, so a 404
        // still proves the key authenticated — only an auth failure disproves it.
        if (response.ok || response.status === 404) return { ok: true }
        return { ok: false, reason: describeStatus(response.status), status: response.status }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "The provider did not respond in time. The key was not saved." }
    }
    // Deliberately not including the error text: a fetch failure can carry the
    // request URL, and this string is both shown and logged.
    return { ok: false, reason: "Could not reach the provider to check this key." }
  }
}
