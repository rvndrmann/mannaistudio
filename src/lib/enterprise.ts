import { CREDIT_EXCHANGE_RATE } from "@/lib/studio/credits"

export const DEFAULT_ENTERPRISE_RATE = 200

export type EnterpriseRate = { usdPerMinute: number; currency: string; enabled: boolean }

/**
 * What an engagement costs in credits.
 *
 * The rate is published in dollars and the wallet is kept in credits, so the
 * conversion has to happen somewhere. It happens here, and identically in
 * create_enterprise_order, so the number the client agrees to on the button is
 * the number the database takes.
 *
 * Rounded up, matching the SQL: charging a part credit would let a fractional
 * minute be produced for fractionally less than the published rate.
 */
export function enterpriseCreditsFor(minutes: number, usdPerMinute: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  if (!Number.isFinite(usdPerMinute) || usdPerMinute <= 0) return 0
  return Math.ceil(minutes * usdPerMinute * CREDIT_EXCHANGE_RATE.creditsPerDollar)
}

export function normalizeEnterpriseRate(value: unknown): EnterpriseRate {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    usdPerMinute: typeof raw.usdPerMinute === "number" && raw.usdPerMinute > 0 ? raw.usdPerMinute : DEFAULT_ENTERPRISE_RATE,
    currency: typeof raw.currency === "string" && raw.currency.trim() ? raw.currency : "USD",
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
  }
}
