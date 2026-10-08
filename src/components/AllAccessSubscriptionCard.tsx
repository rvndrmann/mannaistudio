"use client"

import { ALL_ACCESS_NAME } from "@/lib/all-access-plan"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"

type Subscription = { id: string; status: string; paid_until: string | null; cancel_at_cycle_end: boolean }
type Offer = { configured: boolean; priceInr: number | null; active: boolean; paidUntil: string | null; subscription: Subscription | null }
type CheckoutResult = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
type RazorpayInstance = { open(): void; on(event: string, callback: () => void): void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

async function loadCheckout() {
  const getGateway = () => (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
  if (getGateway()) return getGateway()!
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Could not load payment checkout."))
    document.body.appendChild(script)
  })
  if (!getGateway()) throw new Error("Payment checkout is unavailable.")
  return getGateway()!
}

export default function AllAccessSubscriptionCard() {
  const { user, signInWithGoogle } = useAuth()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const load = useCallback(async () => {
    const response = await fetch("/api/razorpay/all-access", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Could not load subscription.")
    setOffer(data)
  }, [])
  useEffect(() => { load().catch(error => setMessage(error.message)) }, [load, user])

  async function subscribe() {
    if (!user) { signInWithGoogle("/billing"); return }
    setBusy(true)
    setMessage("")
    try {
      const Gateway = await loadCheckout()
      const response = await fetch("/api/razorpay/all-access", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not start subscription.")
      const checkout = new Gateway({
        key: data.keyId, subscription_id: data.subscriptionId,
        name: "AI Mastery", description: "All courses + Creator Studio · Own API keys · No included credits",
        prefill: { email: data.email, name: data.name },
        handler: async (result: CheckoutResult) => {
          try {
            const verification = await fetch("/api/razorpay/all-access/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) })
            const verified = await verification.json()
            if (!verification.ok) throw new Error(verified.error || "Could not verify payment.")
            setMessage(verified.active ? "Subscription active. Open your courses or connect your API keys below." : "Payment authorized. Access activates after the first subscription charge is confirmed.")
            await load()
          } catch (error) { setMessage(error instanceof Error ? error.message : "Payment verification failed.") }
          finally { setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      checkout.on("payment.failed", () => { setMessage("Payment failed. Please retry."); setBusy(false) })
      checkout.open()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout failed."); setBusy(false) }
  }
  async function cancel() {
    if (!offer?.subscription) return
    setBusy(true)
    try {
      const response = await fetch("/api/razorpay/all-access", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscriptionId: offer.subscription.id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await load()
      setMessage("Renewal cancelled. Paid access continues until the date shown.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cancellation failed.") }
    finally { setBusy(false) }
  }
  const subscription = offer?.subscription
  const ongoing = subscription && ["creating", "created", "authenticated", "active", "pending", "halted"].includes(subscription.status)
  return (
    <section className="mx-auto my-10 max-w-6xl rounded-3xl border border-primary/40 bg-primary/5 p-7 md:p-10" aria-labelledby="all-access-title">
      <p className="text-sm font-semibold text-primary">Learn and create with your own API keys</p>
      <h2 id="all-access-title" className="mt-2 text-3xl font-semibold">{ALL_ACCESS_NAME}</h2>
      <p className="mt-3 max-w-3xl text-white/65">Access every published course, including new releases while subscribed, and use Creator Studio with your own OpenAI, Gemini, fal.ai, or BytePlus keys. Your provider bills you directly for chat and generation. No Studio credits are included or used.</p>
      <p className="mt-4 text-2xl font-semibold">{offer?.priceInr ? `₹${offer.priceInr.toLocaleString("en-IN")} / month` : "Price available when checkout is configured"}</p>
      {offer?.active && <p className="mt-3 text-primary">Access active until {new Date(offer.paidUntil!).toLocaleDateString("en-IN")}{subscription?.cancel_at_cycle_end || subscription?.status === "cancelled" ? " · Renewal cancelled" : ""}</p>}
      {subscription && !offer?.active && <p className="mt-3 text-white/60">Subscription status: {subscription.status}. Access starts after a confirmed charge.</p>}
      <div className="mt-5 flex flex-wrap gap-4">
        {!offer?.active && <button onClick={subscribe} disabled={busy || !offer?.configured || Boolean(ongoing && subscription?.status !== "created")} className="rounded-xl bg-primary px-5 py-3 font-semibold text-black disabled:opacity-40">{busy ? "Please wait…" : subscription?.status === "created" ? "Complete checkout" : "Subscribe to AI Director Hub Pro"}</button>}
        {ongoing && !subscription?.cancel_at_cycle_end && subscription?.status !== "creating" && <button onClick={cancel} disabled={busy} className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-40">{offer?.active ? "Cancel subscription renewal" : "Cancel pending subscription"}</button>}
        <Link href="/courses" className="rounded-xl border border-white/20 px-5 py-3">Browse courses</Link>
        {offer?.active && <Link href="/studio/integrations" className="rounded-xl border border-white/20 px-5 py-3">Connect API keys</Link>}
        <button onClick={() => load().catch(error => setMessage(error.message))} className="px-2 py-3 text-sm text-white/60">Refresh status</button>
      </div>
      <p className="mt-4 text-sm text-white/50">A funded provider account is required. Features without support for your own keys cannot run on this plan. Cancel anytime; paid access continues through the current period.</p>
      {message && <p role="status" className="mt-4 text-sm text-primary">{message}</p>}
    </section>
  )
}
