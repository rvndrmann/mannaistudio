"use client"

import { useState, useEffect } from "react"
import { Zap, Plus, X, Check, Loader2, CreditCard, AlertCircle } from "lucide-react"

export default function CreditBadge({ className }: { className?: string }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [loadingPkgId, setLoadingPkgId] = useState<string | null>(null)
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null)
  const [topUpError, setTopUpError] = useState<string | null>(null)

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

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const handleTopUp = async (packageId: string) => {
    setLoadingPkgId(packageId)
    setTopUpSuccess(null)
    setTopUpError(null)
    try {
      const ok = await loadRazorpayScript()
      if (!ok) throw new Error("Failed to load Razorpay payment gateway.")

      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create payment order")

      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: "INR",
        name: "AI Director Hub Studio",
        description: `${data.credits.toLocaleString()} Generation Credits`,
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
                packageId,
              }),
            })
            const verifyData = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed")
            setCredits(verifyData.newBalance)
            setTopUpSuccess(verifyData.message)
          } catch (vErr) {
            setTopUpError(vErr instanceof Error ? vErr.message : "Payment verification failed")
          } finally {
            setLoadingPkgId(null)
          }
        },
        modal: {
          ondismiss: () => setLoadingPkgId(null),
        },
      })
      rzp.open()
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Top-up failed")
      setLoadingPkgId(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`group flex items-center gap-1.5 rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-3 py-1.5 text-xs font-bold text-[#b9f42e] transition hover:bg-[#b9f42e] hover:text-black ${className || ""}`}
        title="Click to top up AI Generation Credits via Razorpay."
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
                <p className="text-xs text-zinc-400">Secure Razorpay Payment Gateway</p>
              </div>
            </div>

            {topUpSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#b9f42e]/40 bg-[#b9f42e]/15 p-3 text-xs font-semibold text-[#b9f42e]">
                <Check className="h-4 w-4 shrink-0" />
                <span>{topUpSuccess}</span>
              </div>
            )}

            {topUpError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-xs font-semibold text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{topUpError}</span>
              </div>
            )}

            <div className="mb-6 space-y-3">
              {[
                { id: "1000", credits: 1000, price: "₹800 INR", popular: false, desc: "~100 Videos or ~330 Images" },
                { id: "2500", credits: 2500, price: "₹2,000 INR", popular: true, desc: "~250 Videos or ~830 Images" },
                { id: "5000", credits: 5000, price: "₹4,000 INR", popular: false, desc: "~500 Videos or ~1,660 Images" },
                { id: "10000", credits: 10000, price: "₹8,000 INR", popular: false, desc: "~1,000 Videos or ~3,330 Images" },
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
                    disabled={loadingPkgId !== null}
                    onClick={() => handleTopUp(pkg.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black hover:bg-[#a6de25] disabled:opacity-50"
                  >
                    {loadingPkgId === pkg.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="h-3 w-3" />
                        {pkg.price}
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center text-[11px] text-zinc-400">
              🔒 Powered by Razorpay. Full access to AI Video & Image generation.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
