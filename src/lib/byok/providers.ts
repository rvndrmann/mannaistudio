import { z } from "zod"

/**
 * What each provider's credential is made of, and where it is allowed to be
 * sent.
 *
 * The host allowlist is the load-bearing part. A credential attached to a URL
 * the caller chose is how a request forgery turns into credential theft, and
 * the model can suggest URLs — so the outbound host is never taken from a tool
 * argument, a database column or an environment variable. It is fixed here,
 * beside the credential it authenticates.
 */

export const byokProviders = ["byteplus", "fal", "openai", "gemini"] as const
export type ByokProvider = (typeof byokProviders)[number]

export function isByokProvider(value: string): value is ByokProvider {
  return (byokProviders as readonly string[]).includes(value)
}

/**
 * The BYOK provider a generation model's provider maps to, or null when the
 * model cannot run on a customer key at all.
 *
 * The generation catalogue labels Google's models `google` while the credential
 * is called `gemini` — the same account and the same key, named differently in
 * two places written at different times. Compared directly, a connected Gemini
 * key never matched a Google image model, so it silently charged credits and
 * ran on ours. Naming is not a detail when it decides who pays.
 */
export function byokProviderFor(generationProvider: string): ByokProvider | null {
  if (generationProvider === "google") return "gemini"
  return isByokProvider(generationProvider) ? generationProvider : null
}

export type ProviderPartSpec = {
  key: string
  label: string
  hint?: string
  /** Which part the masked hint in the UI is taken from. */
  primary?: boolean
  optional?: boolean
  secret?: boolean
}

export type ProviderSpec = {
  id: ByokProvider
  label: string
  /** Every host this provider's credential may ever be sent to. */
  allowedHosts: string[]
  parts: ProviderPartSpec[]
  helpUrl: string
}

export const providerSpecs: Record<ByokProvider, ProviderSpec> = {
  byteplus: {
    id: "byteplus",
    label: "BytePlus ModelArk",
    // Generation and the Asset Library are different services on different
    // hosts, and both are reached with parts of the same credential.
    allowedHosts: ["ark.ap-southeast.bytepluses.com", "open.byteplusapi.com"],
    parts: [
      { key: "arkApiKey", label: "ARK API key", primary: true, secret: true, hint: "Used for image and video generation." },
      // Not optional in practice: registering a reference image to the Asset
      // Library is what clears Seedance's real-person check, so character work
      // fails without these.
      { key: "accessKey", label: "Access key ID", secret: true, hint: "Required to register reference images for character shots." },
      { key: "secretKey", label: "Secret access key", secret: true },
      { key: "assetGroupId", label: "Asset group ID", optional: true, hint: "Left blank, one is created on your account the first time it is needed." },
    ],
    helpUrl: "https://console.byteplus.com/ark",
  },
  fal: {
    id: "fal",
    label: "fal.ai",
    // The SDK talks to the queue and the REST surface; both carry the key.
    allowedHosts: ["fal.run", "queue.fal.run", "rest.alpha.fal.ai", "fal.media", "v3.fal.media"],
    parts: [{ key: "apiKey", label: "API key", primary: true, secret: true, hint: "The key id and secret joined by a colon, as fal.ai issues it." }],
    helpUrl: "https://fal.ai/dashboard/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    allowedHosts: ["api.openai.com"],
    parts: [{ key: "apiKey", label: "API key", primary: true, secret: true, hint: "Starts with sk-." }],
    helpUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    allowedHosts: ["generativelanguage.googleapis.com"],
    parts: [{ key: "apiKey", label: "API key", primary: true, secret: true }],
    helpUrl: "https://aistudio.google.com/apikey",
  },
}

/** The schema a submitted credential must satisfy before anything is stored. */
export function credentialSchemaFor(provider: ByokProvider) {
  const spec = providerSpecs[provider]
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const part of spec.parts) {
    const field = z.string().trim().min(8, `${part.label} looks too short`).max(400)
    shape[part.key] = part.optional ? field.optional() : field
  }
  return z.object(shape).strict()
}

/** The part whose last four characters the UI is allowed to show. */
export function primaryPartKey(provider: ByokProvider): string {
  const spec = providerSpecs[provider]
  return (spec.parts.find((part) => part.primary) || spec.parts[0]).key
}

/**
 * Whether a URL may carry this provider's credential.
 *
 * Exact host match over HTTPS. No subdomain wildcards: `api.openai.com.evil.tld`
 * ends with the string an `endsWith` check would accept, and that single
 * mistake is the whole attack.
 */
export function isAllowedProviderUrl(provider: ByokProvider, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  return providerSpecs[provider].allowedHosts.includes(parsed.hostname)
}

/**
 * Throws unless the URL is one this provider's credential may be sent to. Call
 * this immediately before attaching an Authorization or x-api-key header.
 */
export function assertAllowedProviderUrl(provider: ByokProvider, url: string): void {
  if (!isAllowedProviderUrl(provider, url)) {
    // The URL is deliberately not echoed: it may carry a token in its query,
    // and this message reaches logs.
    throw new Error(`Refusing to send ${provider} credentials to a host that is not on the allowlist.`)
  }
}
