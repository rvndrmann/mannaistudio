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

/**
 * The listening half, returning its own teardown.
 *
 * Shaped for `useEffect(() => onCreditBalanceChanged(fn), [])` so a subscriber
 * cannot forget the removeEventListener — a leaked listener here holds a stale
 * setState closure and writes an old balance over a fresh one.
 *
 * `balance` is undefined when the notifier had no figure to hand; that means
 * "re-read it", not "it is zero".
 */
export function onCreditBalanceChanged(handler: (balance: number | undefined) => void) {
  if (typeof window === "undefined") return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ balance?: number } | undefined>).detail
    handler(typeof detail?.balance === "number" ? detail.balance : undefined)
  }
  window.addEventListener(creditBalanceChangedEvent, listener)
  return () => window.removeEventListener(creditBalanceChangedEvent, listener)
}
