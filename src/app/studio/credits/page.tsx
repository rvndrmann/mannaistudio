"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Zap, ArrowLeft, Check, Loader2, Sparkles, AlertCircle, CreditCard } from "lucide-react"
import CreditUsageTab from "@/components/credits/CreditUsageTab"
import { formatInr, formatUsd, formatUsdWithInr } from "@/lib/currency"
import TeamTab from "@/components/credits/TeamTab"

type CreditsTab = "topup" | "usage" | "team"

const creditsTabs: { id: CreditsTab; label: string }[] = [
  { id: "topup", label: "Top Up" },
  { id: "usage", label: "Credit Usage" },
  { id: "team", label: "My Team" },
]

export default function CreditsPage() {
  const [credits, setCredits] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState<number>(1000)
  const [loading, setLoading] = useState(false)
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null)
  const [topUpError, setTopUpError] = useState<string | null>(null)
  const [tab, setTab] = useState<CreditsTab>("topup")

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setCredits(json.credits)
      }
    } catch (err) {
      console.warn("Could not fetch credits:", err)
    }
  }

  useEffect(() => {
    fetchCredits()
  }, [])

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const handleTopUp = async (amountInr: number) => {
    if (amountInr < 1000) {
      setTopUpError(`Minimum purchase is 1,000 credits (${formatUsdWithInr(1000)}).`)
      return
    }

    setLoading(true)
    setTopUpSuccess(null)
    setTopUpError(null)

    try {
      const ok = await loadRazorpayScript()
      if (!ok) throw new Error("Failed to load Razorpay payment gateway.")

      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountInr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create payment order")

      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: "INR",
        name: "AI Director Hub Studio",
        description: `${data.credits.toLocaleString()} Generation Credits (₹${data.priceInr.toLocaleString()})`,
        prefill: { email: data.email, name: data.name },
        theme: { color: "#b9f42e" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch("/api/credits/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amountInr,
              }),
            })
            const verifyData = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed")
            setCredits(verifyData.newBalance)
            setTopUpSuccess(verifyData.message)
          } catch (vErr) {
            setTopUpError(vErr instanceof Error ? vErr.message : "Payment verification failed")
          } finally {
            setLoading(false)
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      })
      rzp.open()
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Top-up failed")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-[#e8e6df]">
      {/* Top Header */}
      <header className="border-b border-white/[0.06] bg-[#0a0a0a] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/studio"
            className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Studio</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-3 py-1.5 text-xs font-bold text-[#b9f42e]">
            <Zap className="h-4 w-4 fill-[#b9f42e]" />
            <span>{credits !== null ? `${credits.toLocaleString()} Credits` : "Loading..."}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/10 text-[#b9f42e] mb-4">
            <Zap className="h-7 w-7 fill-[#b9f42e]" />
          </div>
          <h1 className="text-3xl font-black text-white">AI Generation Credits</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {tab === "usage"
              ? "Every credit movement on your account, newest first."
              : tab === "team"
                ? "Share credits with your team and manage who can spend them."
                : `Buy credits from 1,000 (${formatUsdWithInr(1000)}). Secure Razorpay payment integration.`}
          </p>
        </div>

        <div className="mb-8 flex justify-center gap-1 border-b border-white/[0.08]">
          {creditsTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                tab === item.id ? "border-[#b9f42e] text-[#b9f42e]" : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "usage" && <CreditUsageTab />}
        {tab === "team" && <TeamTab />}

        {tab === "topup" && (
          <>
            {topUpSuccess && (
              <div className="mb-8 flex items-center gap-3 rounded-xl border border-[#b9f42e]/40 bg-[#b9f42e]/10 p-4 text-sm font-semibold text-[#b9f42e]">
                <Check className="h-5 w-5 shrink-0" />
                <span>{topUpSuccess}</span>
              </div>
            )}

            {topUpError && (
              <div className="mb-8 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{topUpError}</span>
              </div>
            )}

            {/* Custom Amount Selector Box */}
            <div className="mb-8 rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.03] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#b9f42e]">Flexible Top-Up</span>
                  <h3 className="text-xl font-bold text-white mt-1">Buy Custom Credit Amount</h3>
                  <p className="text-xs text-zinc-400 mt-1">1 credit per ₹1, minimum 1,000 — {formatUsdWithInr(1000)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[1000, 2500, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomAmount(preset)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        customAmount === preset
                          ? "border-[#b9f42e] bg-[#b9f42e] text-black"
                          : "border-white/10 bg-white/[0.04] text-white hover:border-white/20"
                      }`}
                    >
                      {formatUsd(preset)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-3 text-lg font-bold text-[#b9f42e]">₹</span>
                  <input
                    type="number"
                    min={1000}
                    step={100}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full rounded-xl border border-white/15 bg-black/60 py-2.5 pl-9 pr-4 text-lg font-bold text-white outline-none focus:border-[#b9f42e]"
                    placeholder="1000"
                  />
                </div>

                <button
                  disabled={loading || customAmount < 1000}
                  onClick={() => handleTopUp(customAmount)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-8 py-3 text-sm font-black text-black hover:bg-[#a6de25] transition disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Buy {customAmount.toLocaleString()} Credits ({formatUsd(customAmount)})
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Standard Packages Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { id: "1000", credits: 1000, price: formatUsdWithInr(1000), popular: false },
                { id: "2500", credits: 2500, price: formatUsdWithInr(2500), popular: true },
                { id: "5000", credits: 5000, price: formatUsdWithInr(5000), popular: false },
                { id: "10000", credits: 10000, price: formatUsdWithInr(10000), popular: false },
              ].map((pkg) => (
                <div
                  key={pkg.id}
                  className={`relative flex flex-col justify-between rounded-2xl border p-6 transition ${
                    pkg.popular ? "border-[#b9f42e] bg-[#b9f42e]/[0.05]" : "border-white/[0.08] bg-[#0e0e0e] hover:border-white/20"
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 right-6 rounded-full bg-[#b9f42e] px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                      Most Popular
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#b9f42e]" />
                      <span className="text-xl font-bold text-white">{pkg.credits.toLocaleString()} Credits</span>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
                    <span className="text-lg font-black text-white">{pkg.price}</span>
                    <button
                      disabled={loading}
                      onClick={() => handleTopUp(pkg.credits)}
                      className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-xs font-black text-black hover:bg-[#a6de25] transition disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="h-3.5 w-3.5" />
                          Buy Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6 text-center text-xs text-zinc-400">
              🔒 Secure Checkout powered by Razorpay. Full access to Seedance, Flux, GPT-Image, and AI Director models.
            </div>
          </>
        )}
      </main>
    </div>
  )
}
