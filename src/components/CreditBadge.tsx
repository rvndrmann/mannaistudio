"use client"

import { useState, useEffect } from "react"
import { Zap, Plus, X, Check, Loader2, CreditCard } from "lucide-react"

export default function CreditBadge({ className }: { className?: string }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null)

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
    const interval = setInterval(fetchCredits, 15_000)
    return () => clearInterval(interval)
  }, [])

  const handleTopUp = async (packageId: string) => {
    setLoading(true)
    setTopUpSuccess(null)
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
      setTimeout(() => setTopUpSuccess(null), 4000)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Top-up failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`group flex items-center gap-1.5 rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-3 py-1.5 text-xs font-bold text-[#b9f42e] transition hover:bg-[#b9f42e] hover:text-black ${className || ""}`}
        title="1,000 Credits = $10 USD. Click to top up."
      >
        <Zap className="h-3.5 w-3.5 fill-[#b9f42e] group-hover:fill-black" />
        <span>{credits !== null ? `${credits.toLocaleString()} Credits` : "Loading..."}</span>
        <Plus className="h-3 w-3 opacity-70 group-hover:opacity-100" />
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#121412] p-6 text-white shadow-2xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#b9f42e]/15 text-[#b9f42e]">
                <Zap className="h-6 w-6 fill-[#b9f42e]" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Top Up Generation Credits</h3>
                <p className="text-xs text-zinc-400">$10 USD = 1,000 Credits (2x AI Model Cost)</p>
              </div>
            </div>

            {topUpSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#b9f42e]/40 bg-[#b9f42e]/15 p-3 text-xs font-semibold text-[#b9f42e]">
                <Check className="h-4 w-4 shrink-0" />
                <span>{topUpSuccess}</span>
              </div>
            )}

            <div className="mb-6 space-y-3">
              {[
                { id: "1000", credits: 1000, price: "$10 USD", popular: false, desc: "~100 Videos or ~330 Images" },
                { id: "2500", credits: 2500, price: "$25 USD", popular: true, desc: "~250 Videos or ~830 Images" },
                { id: "5000", credits: 5000, price: "$50 USD", popular: false, desc: "~500 Videos or ~1,660 Images" },
                { id: "10000", credits: 10000, price: "$100 USD", popular: false, desc: "~1,000 Videos or ~3,330 Images" },
              ].map((pkg) => (
                <div
                  key={pkg.id}
                  className={`flex items-center justify-between rounded-xl border p-4 transition ${
                    pkg.popular ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{pkg.credits.toLocaleString()} Credits</span>
                      {pkg.popular && (
                        <span className="rounded-md bg-[#b9f42e] px-2 py-0.5 text-[10px] font-black uppercase text-black">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{pkg.desc}</p>
                  </div>

                  <button
                    disabled={loading}
                    onClick={() => handleTopUp(pkg.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black hover:bg-[#a6de25] disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : pkg.price}
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center text-[11px] text-zinc-500">
              ⚡ Charges double our real provider API cost (Seedance 2.0 Fast = 10 Credits, SeaDream Pro = 3 Credits).
            </div>
          </div>
        </div>
      )}
    </>
  )
}
