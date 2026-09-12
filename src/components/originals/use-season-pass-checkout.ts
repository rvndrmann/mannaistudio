"use client"

import { useCallback, useState } from "react"

/**
 * Buying a season pass, in one place.
 *
 * Lifted out of EpisodePaywall when the presale gave the pass a second place
 * to be sold from. A presale runs before the paid episodes exist, so the
 * paywall — which only appears over a locked episode — is not a surface it can
 * be bought on at all, and the series page needed the same six steps: load the
 * gateway, open an order, hand it to Razorpay, verify server-side, tell the
 * page, clear the spinner when the sheet is dismissed.
 *
 * Same rule as the credit packs: the price is never sent. The route reads the
 * series row and prices the order itself, so a browser holding a stale presale
 * button gets an order at whatever the pass costs now, not what it was showing.
 */
export function useSeasonPassCheckout(options: { onPurchased?: () => void } = {}) {
  const { onPurchased } = options
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGateway = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true)
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const buyPass = useCallback(async (seriesId: string) => {
    setPending(true)
    setError(null)
    try {
      const ready = await loadGateway()
      if (!ready) throw new Error("Could not reach the payment gateway.")

      const res = await fetch("/api/originals/season-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not start checkout")

      const RazorpayCtor = (window as unknown as { Razorpay: new (config: unknown) => { open: () => void } }).Razorpay
      const checkout = new RazorpayCtor({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: "INR",
        name: "AI Director Hub Originals",
        description: `${data.seriesTitle} — Season Pass (${data.days} days)`,
        prefill: { email: data.email, name: data.name },
        theme: { color: "#b9f42e" },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch("/api/originals/season-pass/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })
            const verifyData = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed")
            onPurchased?.()
          } catch (verifyErr) {
            setError(verifyErr instanceof Error ? verifyErr.message : "Payment verification failed")
          } finally {
            setPending(false)
          }
        },
        // Without this a dismissed sheet leaves the button spinning for ever.
        modal: { ondismiss: () => setPending(false) },
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout")
      setPending(false)
    }
  }, [onPurchased])

  return { buyPass, pending, error, setError }
}
