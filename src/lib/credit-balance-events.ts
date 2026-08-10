export const creditBalanceChangedEvent = "ai-director:credit-balance-changed"

/**
 * Keeps every visible credit badge in sync after a generation request settles.
 * Supplying the server-returned balance avoids an extra round trip; omitting it
 * asks badges to re-fetch, which is important when a provider fails after a
 * credit reservation has already been made.
 */
export function notifyCreditBalanceChanged(balance?: number) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(creditBalanceChangedEvent, {
    detail: typeof balance === "number" ? { balance } : undefined,
  }))
}
