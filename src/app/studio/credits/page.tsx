"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Zap, ArrowLeft, Check, Loader2, Sparkles, AlertCircle } from "lucide-react"

export default function CreditsPage() {
  const [credits, setCredits] = useState<number | null>(null)
  const [isMember, setIsMember] = useState<boolean>(true)
  const [loading, setLoading] = useState(false)
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null)
  const [topUpError, setTopUpError] = useState<string | null>(null)

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setCredits(json.credits)
        setIsMember(json.isMember)
      }
    } catch (err) {
      console.warn("Could not fetch credits:", err)
    }
  }

  useEffect(() => {
    fetchCredits()
  }, [])

  const handleTopUp = async (packageId: string) => {
    setLoading(true)
    setTopUpSuccess(null)
    setTopUpError(null)
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Top-up failed")
      setCredits(json.newBalance)
      setTopUpSuccess(json.message)
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Top-up failed")
    } finally {
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
            $10 USD = 1,000 Credits ($0.01 / credit). Use credits for AI video and image generation.
          </p>
        </div>

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

        {/* Credit Packages Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { id: "1000", credits: 1000, price: "$10 USD", popular: false, desc: "~100 Videos or ~330 Images" },
            { id: "2500", credits: 2500, price: "$25 USD", popular: true, desc: "~250 Videos or ~830 Images" },
            { id: "5000", credits: 5000, price: "$50 USD", popular: false, desc: "~500 Videos or ~1,660 Images" },
            { id: "10000", credits: 10000, price: "$100 USD", popular: false, desc: "~1,000 Videos or ~3,330 Images" },
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
                <p className="mt-2 text-xs text-zinc-400">{pkg.desc}</p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
                <span className="text-lg font-black text-white">{pkg.price}</span>
                <button
                  disabled={loading}
                  onClick={() => handleTopUp(pkg.id)}
                  className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-xs font-black text-black hover:bg-[#a6de25] transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Top Up Now"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6 text-center text-xs text-zinc-400">
          ⚡ 1,000 Credits = $10 USD. Full access to Seedance, Flux, GPT-Image, and AI Director models.
        </div>
      </main>
    </div>
  )
}
