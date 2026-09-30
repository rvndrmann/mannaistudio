"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { billingTiers } from "@/lib/billing-plans"
import { formatUsd } from "@/lib/currency"

const STUDIO_SUBSCRIPTION_PRICE_INR = billingTiers.plus.priceInr

function timeRemaining(expiresAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(expiresAt) - now)
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

export default function StudioCreditOffer({
  expiresAt,
  onPurchased,
}: {
  expiresAt: string
  onPurchased?: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [monthlyBusy, setMonthlyBusy] = useState(false)
  const [message, setMessage] = useState("")
  const remaining = timeRemaining(expiresAt, now)
  const expired = Date.parse(expiresAt) <= now

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const subscribeMonthly = async () => {
    setMonthlyBusy(true)
    setMessage("")
    try {
      if (!(window as any).Razorpay) {
        const script = document.createElement("script")
        script.src = "https://checkout.razorpay.com/v1/checkout.js"
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve()
          script.onerror = () => reject(new Error("Could not load payment checkout."))
          document.body.appendChild(script)
        })
      }
      const response = await fetch("/api/razorpay/studio-subscription", { method: "POST" })
      const subscription = await response.json()
      if (!response.ok) throw new Error(subscription.error || "Could not start subscription checkout.")
      const checkout = new (window as any).Razorpay({
        key: subscription.keyId,
        subscription_id: subscription.subscriptionId,
        name: "AI Director Hub Creator Studio",
        description: `Creator Studio · ${formatUsd(STUDIO_SUBSCRIPTION_PRICE_INR)}/month · 3,000 credits/month`,
        prefill: { email: subscription.email, name: subscription.name },
        theme: { color: "#b9f42e" },
        handler: () => {
          setMessage("Subscription authorized. Creator Studio access and monthly credits activate when Razorpay confirms the first payment.")
          setMonthlyBusy(false)
          onPurchased?.()
        },
        modal: { ondismiss: () => setMonthlyBusy(false) },
      })
      checkout.open()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start subscription checkout.")
      setMonthlyBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/[.06] p-5 text-white sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary"><Sparkles className="h-4 w-4" /> Limited-time Studio access</p>
          <h2 className="mt-2 text-lg font-bold">Subscribe to Creator Studio</h2>
          <p className="mt-1 text-sm text-white/55">Subscribe before your access window ends to keep Creator Studio access and get 3,000 credits each month.</p>
          {!expired && <p className="mt-2 text-sm font-semibold text-primary">Time remaining: {remaining}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:min-w-52">
          <button
            type="button"
            disabled={monthlyBusy || expired}
            onClick={() => void subscribeMonthly()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {monthlyBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {expired ? "Access window expired" : monthlyBusy ? "Opening checkout…" : `Subscribe · ${formatUsd(STUDIO_SUBSCRIPTION_PRICE_INR)}/month`}
          </button>
        </div>
      </div>
      {message && <p role="status" className="mt-4 text-sm text-white/75">{message}</p>}
    </section>
  )
}
