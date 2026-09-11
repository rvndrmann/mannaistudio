"use client"

import { useCallback, useState } from "react"
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events"

/**
 * Buying a credit pack, in one place.
 *
 * The same six steps — load the gateway, open an order, hand it to Razorpay,
 * verify the signature server-side, take the new balance, tell every credit
 * badge on the page — were written out in CreditPackModal and again in
 * EpisodePaywall, and the account page would have made three. They had already
 * drifted: one sent the whole Razorpay response to /api/credits/verify and the
 * other picked out three fields by hand, and only one of them cleared its
 * pending state when the gateway sheet was dismissed.
 *
 * The verification call is deliberately still server-side. Nothing the browser
 * reports about a payment is trusted — /api/credits/verify checks the signature
 * and reads the credit figure off the Razorpay order, so a tampered client can
 * only fail the check, never grant itself credits.
 */
export function useCreditPackCheckout(options: {
  onPurchased?: (newBalance: number) => void
  onSuccess?: (message: string) => void
} = {}) {
  const { onPurchased, onSuccess } = options
  const [pendingPackId, setPendingPackId] = useState<string | null>(null)
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

  const buyPack = useCallback(async (packageId: string) => {
    setPendingPackId(packageId)
    setError(null)
    try {
      const ready = await loadGateway()
      if (!ready) throw new Error("Could not reach the payment gateway.")

      const res = await fetch("/api/originals/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
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
        description: `${Number(data.credits).toLocaleString()} Credits`,
        prefill: { email: data.email, name: data.name },
        theme: { color: "#b9f42e" },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch("/api/credits/verify", {
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
            onSuccess?.(verifyData.message)
            onPurchased?.(verifyData.newBalance)
            // Every credit badge on the page reads the same balance.
            notifyCreditBalanceChanged(verifyData.newBalance)
          } catch (verifyErr) {
            setError(verifyErr instanceof Error ? verifyErr.message : "Payment verification failed")
          } finally {
            setPendingPackId(null)
          }
        },
        // Without this a dismissed sheet leaves every pack button spinning for
        // ever, and the viewer cannot retry without reloading the page.
        modal: { ondismiss: () => setPendingPackId(null) },
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
      setPendingPackId(null)
    }
  }, [onPurchased, onSuccess])

  return { buyPack, pendingPackId, error, setError }
}
