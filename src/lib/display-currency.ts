import { formatInr, formatUsd, usdFromInr } from "./currency"

/**
 * The Pro subscription's price, and admin-typed rupee text, shown in dollars.
 *
 * The rate and the rounding live in ./currency, with everything else on the
 * site that shows a rupee price in dollars: one rate, rounded up, so a figure
 * shown is never less than the card is charged. This file only adds what is
 * particular to Pro.
 */

/** AI Director Hub Pro, per month. The Razorpay plan is what is charged. */
export const PRO_PRICE_INR = 189

export { formatInr, usdFromInr }
export const formatUsdFromInr = formatUsd

export const PRO_PRICE_USD_LABEL = formatUsdFromInr(PRO_PRICE_INR)

/**
 * Rewrites rupee amounts inside a sentence as dollars.
 *
 * For text an admin typed — the offer banner is stored with its own "₹799" —
 * so the banner cannot quote one currency above a page that shows another.
 */
export function showRupeesAsDollars(text: string) {
  return text.replace(/(?:₹|Rs\.?\s?)\s?(\d+(?:,\d+)*(?:\.\d+)?)/g, (_match, amount: string) => formatUsdFromInr(Number(amount.replace(/,/g, ""))))
}
