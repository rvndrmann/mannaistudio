/**
 * The subscription tiers, matched to real Razorpay plans.
 *
 * Price and billing period live on the Razorpay plan, not here — Razorpay charges
 * what its plan says regardless of what this file claims. The amounts below are
 * for display and must be kept in step with the Razorpay dashboard; the plan ID
 * is what actually decides the charge.
 */

export const billingTierIds = ["pro", "plus", "studio"] as const
export type BillingTierId = (typeof billingTierIds)[number]

export type BillingTier = {
  id: BillingTierId
  name: string
  planId: string
  /** Rupees per month, for display. The Razorpay plan is the source of truth. */
  priceInr: number
  /** Credits granted on each successful charge. */
  credits: number
  subtitle: string
  features: string[]
  popular?: boolean
}

export const billingTiers: Record<BillingTierId, BillingTier> = {
  pro: {
    id: "pro",
    name: "Pro",
    planId: "plan_T5QGYHcwX5Fkkf",
    priceInr: 999,
    credits: 1_000,
    subtitle: "For creators shipping their first AI videos",
    features: [
      "AI Director chat workflow",
      "Bring your own API keys (provider rates)",
      "Script and storyboard planning",
      "Image generation",
      "Upload image, video, and audio references",
      "Portfolio and course access",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    planId: "plan_TORIshpS38HSjR",
    priceInr: 2_999,
    credits: 3_500,
    popular: true,
    subtitle: "For steady weekly production",
    features: [
      "Everything in Pro",
      "Bring your own API keys (provider rates)",
      "Video generation with approval workflow",
      "Character and asset reference library",
      "Voice Director",
      "Team sharing",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    planId: "plan_TORJI0wirAqMCN",
    priceInr: 9_999,
    credits: 12_000,
    subtitle: "For studios running continuous production",
    features: [
      "Everything in Plus",
      "Bring your own API keys (provider rates)",
      "Full-auto production mode",
      "MCP & CLI access",
      "Marketing agent",
      "Priority generation routing",
    ],
  },
}

export const orderedBillingTiers: BillingTier[] = billingTierIds.map((id) => billingTiers[id])

export function isBillingTierId(value: unknown): value is BillingTierId {
  return typeof value === "string" && (billingTierIds as readonly string[]).includes(value)
}

/** Resolves a Razorpay plan ID back to its tier, so a webhook can grant the right credits. */
export function tierForPlanId(planId: string | undefined | null): BillingTier | null {
  if (!planId) return null
  return orderedBillingTiers.find((tier) => tier.planId === planId) ?? null
}

/**
 * Admin may override plan IDs and prices in site_settings without a deploy. Only
 * fields actually present are applied, so a partial override cannot blank a tier.
 */
export function applyBillingOverrides(value: unknown): Record<BillingTierId, BillingTier> {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).plans
    : null
  if (!raw || typeof raw !== "object") return billingTiers

  const merged = {} as Record<BillingTierId, BillingTier>
  for (const id of billingTierIds) {
    const override = (raw as Record<string, unknown>)[id]
    const base = billingTiers[id]
    if (!override || typeof override !== "object") {
      merged[id] = base
      continue
    }
    const patch = override as Record<string, unknown>
    merged[id] = {
      ...base,
      planId: typeof patch.planId === "string" && patch.planId.trim() ? patch.planId.trim() : base.planId,
      priceInr: typeof patch.priceInr === "number" && patch.priceInr > 0 ? patch.priceInr : base.priceInr,
      credits: typeof patch.credits === "number" && patch.credits >= 0 ? patch.credits : base.credits,
    }
  }
  return merged
}
