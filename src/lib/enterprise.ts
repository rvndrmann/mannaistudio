export const DEFAULT_ENTERPRISE_RATE = 200

export type EnterpriseRate = { usdPerMinute: number; currency: string; enabled: boolean }

export function normalizeEnterpriseRate(value: unknown): EnterpriseRate {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    usdPerMinute: typeof raw.usdPerMinute === "number" && raw.usdPerMinute > 0 ? raw.usdPerMinute : DEFAULT_ENTERPRISE_RATE,
    currency: typeof raw.currency === "string" && raw.currency.trim() ? raw.currency : "USD",
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
  }
}
