/**
 * Prices are shown in dollars and charged in rupees.
 *
 * Every charge goes through Razorpay in INR — the plan there is the price, and
 * nothing here changes what a card is billed. The dollar figure exists so a
 * visitor outside India can read a price without converting it, and it is a
 * display of the rupee amount, never a second price: the one place money is
 * taken states the exact rupees.
 *
 * The rate is fixed rather than fetched. A live rate would move the advertised
 * price a few cents every day and make a cached page disagree with the one
 * next to it. It was set from the mid-market rate on 13 October 2026 (95.9);
 * revisit it when the rupee has moved enough to matter.
 */
export const INR_PER_USD = 95.9

/** AI Director Hub Pro, per month. The Razorpay plan is what is charged. */
export const PRO_PRICE_INR = 799

/** A rupee amount as dollars, to the cent. */
export function usdFromInr(inr: number) {
  return Math.round((inr / INR_PER_USD) * 100) / 100
}

/** "$8.33" for 799 — whole dollars lose the cents rather than show ".00". */
export function formatUsdFromInr(inr: number) {
  const usd = usdFromInr(inr)
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(usd) ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** The exact charge, for the step where it is taken. */
export function formatInr(inr: number) {
  return `₹${inr.toLocaleString("en-IN")}`
}

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
