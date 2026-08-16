// Prices are set and charged in rupees. Razorpay is an Indian gateway, its plans
// hold rupee amounts, and international cards settle against those amounts — so
// nothing here changes what anyone is charged.
//
// What it changes is what the price looks like. The ads run in the USA, and a
// four-figure rupee number reads as an unfamiliar foreign amount to that
// audience: they cannot tell at a glance whether ₹2,999 is ten dollars or a
// hundred, and a price you have to go and convert is a price you do not buy.
// So the dollar figure leads and the rupee charge is named next to it, because
// the rupee amount is what will appear on the card statement.
//
// The rate is a fixed constant, not a live FX lookup. The dollar figure is an
// estimate either way — the customer's own bank sets the rate that actually
// applies — and a headline price that moves between page loads is worse than one
// that is a few cents off. Conversions round UP, so the figure shown is never
// less than what the card is likely to be charged. Override with
// NEXT_PUBLIC_INR_PER_USD when the rate drifts far enough to matter.

const FALLBACK_INR_PER_USD = 88

export const INR_PER_USD = (() => {
  const configured = Number(process.env.NEXT_PUBLIC_INR_PER_USD)
  return Number.isFinite(configured) && configured > 0 ? configured : FALLBACK_INR_PER_USD
})()

/** Dollars for a rupee amount, rounded up to a clean figure. */
export function usdFromInr(inr: number): number {
  if (!Number.isFinite(inr) || inr <= 0) return 0
  const exact = inr / INR_PER_USD
  // Whole dollars once the price is big enough that cents are noise; cents below
  // that, so a small top-up does not round from $2.10 up to $3.
  return exact >= 10 ? Math.ceil(exact) : Math.ceil(exact * 100) / 100
}

/** "$34" — the headline price. */
export function formatUsd(inr: number): string {
  const usd = usdFromInr(inr)
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(usd) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** "₹2,999" — what Razorpay actually charges. */
export function formatInr(inr: number): string {
  return `₹${Math.round(inr).toLocaleString("en-IN")}`
}

/**
 * "$34 (₹2,999)" — the pair. Never show the dollar figure on its own at the
 * point of payment: the statement will read in rupees, and a customer who was
 * shown only dollars has grounds to call that a surprise.
 */
export function formatUsdWithInr(inr: number): string {
  return `${formatUsd(inr)} (${formatInr(inr)})`
}
