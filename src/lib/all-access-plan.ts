export const ALL_ACCESS_TYPE = "academy_studio_byok"
export const ALL_ACCESS_SOURCE = "all_access_subscription"
export const ALL_ACCESS_NAME = "AI Director Hub Pro"

// A dedicated Razorpay plan is required; never reuse a credit-bearing plan.
export function allAccessPlanId() {
  return process.env.RAZORPAY_ALL_ACCESS_PLAN_ID?.trim() || "plan_T5OgebbEgwBn1M"
}
export function isPaidAccessPeriod(row: { paid_until?: string | null } | null, now = Date.now()) {
  return Boolean(row?.paid_until && Date.parse(row.paid_until) > now)
}
