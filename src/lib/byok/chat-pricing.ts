import { CREDIT_EXCHANGE_RATE } from "@/lib/studio/credits"

/**
 * What a Director chat turn costs, and what to charge for it.
 *
 * Generation was metered from the day it shipped; the agent never was. Every
 * turn ran on the platform's OpenAI or Gemini account for free, and a turn is
 * not cheap — the Director makes six or seven model round trips before it
 * proposes anything, each carrying a context that grows as it goes.
 *
 * The rate card follows the same formula as the generation one: the provider's
 * published price, multiplied, converted at 1 credit = $0.01. Written per model
 * and per million tokens, which is how providers quote it, so checking a figure
 * against their page is a direct comparison rather than arithmetic.
 */

/**
 * The markup on provider cost.
 *
 * Note this is 2.0 while the generation rate card uses 2.2 — a deliberate
 * choice, not a rounding. Moving chat onto 2.2 is a one-line change here.
 */
export const CHAT_MARKUP = 2.0

export type TokenRate = {
  /** USD per million input tokens. */
  inputPerMillion: number
  /** USD per million output tokens. */
  outputPerMillion: number
  /** What the published figure was checked against, so it can be rechecked. */
  source: string
}

/**
 * Published provider rates, verified August 2026.
 *
 * Only models the Director actually offers are quoted here. Anything else is
 * priced by FALLBACK_TOKEN_RATE below.
 */
export const CHAT_TOKEN_RATES: Record<string, TokenRate> = {
  "gpt-5.6-luna": {
    inputPerMillion: 0.2,
    outputPerMillion: 1.2,
    source: "OpenAI, after the 30 July 2026 reduction",
  },
}

/**
 * The rate to use for a model with no entry.
 *
 * Deliberately expensive: an unpriced model is usually a newer one, and
 * guessing low means serving it at a loss with nothing to notice the mistake.
 *
 * Stated as a constant rather than derived from the dearest card entry, which
 * is how it used to work. That derivation quietly depended on an expensive
 * model staying in the card — when Gemini 3.6 Flash was retired, the card was
 * left holding only Luna and the fallback would have collapsed from $3.75 to
 * $1.20 per million output tokens, undercharging every future model by three
 * times. The figure is Gemini's post-January-2027 rate, kept as a ceiling
 * precisely because nothing in the card has to justify it any more.
 */
export const FALLBACK_TOKEN_RATE: TokenRate = {
  inputPerMillion: 1.5,
  outputPerMillion: 7.5,
  source: "Deliberate ceiling for an unpriced model; Google's 2027 Flash rate",
}

function rateFor(model: string): TokenRate {
  return CHAT_TOKEN_RATES[model] ?? FALLBACK_TOKEN_RATE
}

export type TokenUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

/** What the provider charged us, in USD. */
export function providerCostUsd(model: string, usage: TokenUsage): number {
  const rate = rateFor(model)
  const input = Math.max(0, Number(usage.input_tokens) || 0)
  const output = Math.max(0, Number(usage.output_tokens) || 0)
  return (input / 1_000_000) * rate.inputPerMillion + (output / 1_000_000) * rate.outputPerMillion
}

/**
 * Credits to charge for one turn.
 *
 * Rounded up, so the smallest chargeable turn is one credit — but a turn that
 * reported no usage at all costs nothing, because that is a turn we have no
 * evidence happened rather than a very small one.
 */
export function chatTurnCredits(model: string, usage: TokenUsage): number {
  const tokens = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
  if (tokens <= 0) return 0
  const cost = providerCostUsd(model, usage)
  return Math.max(1, Math.ceil(cost * CREDIT_EXCHANGE_RATE.creditsPerDollar * CHAT_MARKUP))
}
