"use client"

import { useCallback, useState } from "react"
import type { ManagedBrief } from "@/lib/managed-brief"

/**
 * Buying a managed production.
 *
 * The same six steps as every other purchase on the site — load the gateway,
 * open an order, hand it to Razorpay, verify server-side, tell the page, clear
 * the spinner when the sheet is dismissed — and the same rule: the price is
 * never sent. The route prices the package it is named and creates the project
 * itself, so a page left open across a price change buys at today's price.
 *
 * Micro-drama comes back as `mode: "proposal"` with no gateway involved, and
 * the caller routes straight to the project.
 */
export function useManagedCheckout(options: { onDone?: (projectId: string, mode: "checkout" | "proposal") => void } = {}) {
  const { onDone } = options
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

  const submit = useCallback(async (payload: {
    serviceType: string
    packageKey: string
    name: string
    aspectRatio: string
    brandId?: string | null
    brief: ManagedBrief
  }) => {
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/managed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not start checkout")

      if (data.mode === "proposal") {
        onDone?.(data.projectId, "proposal")
        setPending(false)
        return
      }

      const ready = await loadGateway()
      if (!ready) throw new Error("Could not reach the payment gateway.")

      const RazorpayCtor = (window as unknown as { Razorpay: new (config: unknown) => { open: () => void } }).Razorpay
      const checkout = new RazorpayCtor({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: "INR",
        name: "AI Director Hub",
        description: `${data.serviceName} — ${data.packageName}`,
        prefill: { email: data.email, name: data.name },
        theme: { color: "#b9f42e" },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch("/api/managed/checkout/verify", {
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
            onDone?.(verifyData.projectId || data.projectId, "checkout")
          } catch (verifyErr) {
            setError(verifyErr instanceof Error ? verifyErr.message : "Payment verification failed")
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
  }, [onDone])

  return { submit, pending, error, setError }
}
