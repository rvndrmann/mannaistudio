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

export function decideBilling(input: {
  /** Whether the user has an active credential for the serving provider. */
  hasCredential: boolean
  /** What the platform would charge if it were paying the provider. */
  platformCredits: number
}): BillingDecision {
  if (input.hasCredential) return { mode: "byok", credits: 0 }
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
