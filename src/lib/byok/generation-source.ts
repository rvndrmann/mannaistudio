import { generationProvider, type ImageGenerationModelId, type VideoGenerationModelId } from "@/lib/studio/generation-models"
import { isByokProvider } from "./providers"

/**
 * Which account a generation will run on, decided once and read everywhere.
 *
 * The billing decision lives on the server, where it belongs. But the button
 * that starts a generation was pricing itself from the credit table alone, so
 * the two disagreed in the two ways that matter most:
 *
 *  - a connected user saw "⚡ 12" and was charged nothing, and
 *  - a user out of credits who had connected their own key found the button
 *    greyed out with "buy more credits", over a cost nobody was going to ask
 *    them for. That is precisely the person BYOK exists for.
 *
 * So the rule is written once, here, and both the card and the server read it.
 * The card cannot drift from what will actually be charged, because it is not
 * making its own decision any more.
 *
 * The separation is per provider and absolute: a generation is served by the
 * customer's key or by ours, never partly both, and one never falls back to the
 * other silently. A key that stops working fails the job rather than quietly
 * spending studio credits.
 */

export type GenerationSource = {
  /** True when the customer's own provider account will be billed. */
  ownKey: boolean
  /** The provider that will serve it, whoever pays. */
  provider: string
  /** Credits this will cost. Always zero on the customer's own key. */
  credits: number
  /** What the button and the cost chip should say. */
  label: string
}

export function resolveGenerationSource(input: {
  model: ImageGenerationModelId | VideoGenerationModelId
  /** Providers this user has connected, from /api/studio/integrations. */
  connectedProviders: readonly string[]
  /** What it would cost if the studio paid. */
  platformCredits: number
}): GenerationSource {
  const provider = generationProvider(input.model)
  const ownKey = isByokProvider(provider) && input.connectedProviders.includes(provider)
  return {
    ownKey,
    provider,
    credits: ownKey ? 0 : input.platformCredits,
    label: ownKey ? "Your key" : `${input.platformCredits}`,
  }
}

/**
 * Whether a low credit balance should stop this generation.
 *
 * Only when the studio is paying. Blocking a customer's own key on our balance
 * is the bug this exists to prevent.
 */
export function blockedByCredits(source: GenerationSource, creditBalance: number | null): boolean {
  if (source.ownKey) return false
  if (creditBalance === null) return false
  return creditBalance < source.credits
}
