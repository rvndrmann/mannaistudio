/**
 * Which account pays for a generation.
 *
 * The rule, stated once so both the estimate and the charge read it from the
 * same place: a generation runs on the customer's own key when they have
 * connected one for the provider that will actually serve it, and then it costs
 * no credits. Otherwise the platform's key serves it and credits are charged as
 * before. Connecting a key is what opts a provider in; there is no separate
 * toggle to fall out of step with the vault.
 *
 * The billing mode is written onto the job, not inferred later. A job that
 * charged nothing must be recognisable as such for the rest of its life —
 * otherwise the failure path refunds a charge that never happened.
 */

export type BillingMode = "credits" | "byok"

export type BillingDecision = {
  mode: BillingMode
  /** Credits to charge. Always zero under BYOK. */
  credits: number
}

export class OwnKeysOnlyError extends Error {
  constructor(provider: string) {
    super(`You have chosen to run everything on your own provider keys, and no ${provider} key is connected. Connect one under Integrations, or turn off "only my own keys" to let this run on studio credits.`)
    this.name = "OwnKeysOnlyError"
  }
}

export function decideBilling(input: {
  /** Whether the user has an active credential for the serving provider. */
  hasCredential: boolean
  /** What the platform would charge if it were paying the provider. */
  platformCredits: number
  /**
   * The user has asked never to spend studio credits. With it on, a provider
   * they have not connected is refused outright rather than quietly billed —
   * which is the point of the setting: the studio becomes the interface and
   * their own accounts pay for everything that runs.
   */
  ownKeysOnly?: boolean
  /** Named only so the refusal can say which key is missing. */
  provider?: string
}): BillingDecision {
  if (input.hasCredential) return { mode: "byok", credits: 0 }
  if (input.ownKeysOnly) throw new OwnKeysOnlyError(input.provider || "provider")
  return { mode: "credits", credits: input.platformCredits }
}

/**
 * What a failed job should give back.
 *
 * This existed as `job.credits_used || job.estimated_credits || 0`, which was
 * correct while every job charged credits. Under BYOK a job charges nothing, so
 * `credits_used` is 0 and that expression falls through to `estimated_credits`
 * — refunding credits the user never spent. Repeat a failing BYOK generation
 * and it mints credits.
 *
 * So the refund is decided by the recorded billing mode rather than by which of
 * two numbers happens to be non-zero. A BYOK failure refunds nothing, because
 * nothing was taken; the cost of that failure sat with the provider, and no
 * refund here can reach it.
 */
export function refundableCredits(job: {
  billing_mode?: string | null
  credits_used?: number | null
  estimated_credits?: number | null
}): number {
  if (job.billing_mode === "byok") return 0
  const used = Number(job.credits_used || 0)
  if (used > 0) return used
  return Number(job.estimated_credits || 0)
}

/** What to tell a user whose own key failed mid-generation. */
export function failureNoteFor(mode: BillingMode): string | null {
  if (mode !== "byok") return null
  return "This ran on your own provider key, so no credits were taken and none can be returned. Any charge for the attempt is on your provider account."
}

/**
 * Whether a provider refused because the customer's own account is out of
 * money, rather than because anything is wrong with the request.
 *
 * Worth telling apart, because the answer to it is not "try again" — it is
 * "top up with your provider, or let the studio pay for this one". A generic
 * failure message sends the user hunting through their prompt for a fault that
 * is not there.
 *
 * Matched on the shapes providers actually use. Anything unrecognised is
 * treated as an ordinary failure, which is the safe way round: offering to
 * spend studio credits over an unrelated error would charge for a generation
 * that was going to fail anyway.
 */
export function isProviderOutOfCredit(status: number | null, message: string): boolean {
  const text = (message || "").toLowerCase()
  if (status === 402) return true
  return [
    "insufficient balance",
    "insufficient_quota",
    "insufficient funds",
    "quota exceeded",
    "exceeded your current quota",
    "billing hard limit",
    "account balance",
    "not enough balance",
    "no credit",
    "out of credits",
    "payment required",
  ].some((phrase) => text.includes(phrase))
}

/** What to offer when the customer's own provider account has run dry. */
export function outOfCreditOffer(provider: string): string {
  return `Your ${provider} account has no credit left, so this generation could not run on your key. Top up with ${provider}, or generate this one with studio credits instead.`
}
