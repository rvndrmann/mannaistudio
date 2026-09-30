"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Zap, Plus, X, Check, Loader2, CreditCard, AlertCircle } from "lucide-react"
import { creditBalanceChangedEvent } from "@/lib/credit-balance-events"
import { INR_PER_USD, formatUsd } from "@/lib/currency"
import CreditUsageTab from "@/components/credits/CreditUsageTab"
import TeamTab from "@/components/credits/TeamTab"
import StudioCreditOffer from "@/components/studio/StudioCreditOffer"
import { useAuth } from "@/components/auth/auth-provider"

type AccountTab = "topup" | "usage" | "team"

const accountTabs: { id: AccountTab; label: string }[] = [
  { id: "topup", label: "Top Up" },
  { id: "usage", label: "Credit Usage" },
  { id: "team", label: "My Team" },
]

export default function CreditBadge({ className }: { className?: string }) {
  const MIN_TOP_UP_USD = 5
  const { user } = useAuth()
  const [hasStudioAccess, setHasStudioAccess] = useState(false)
  const [canBuyCredits, setCanBuyCredits] = useState(false)
  const [purchaseOnly, setPurchaseOnly] = useState(false)
  const [purchaseWindowExpiresAt, setPurchaseWindowExpiresAt] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [pending, setPending] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [tab, setTab] = useState<AccountTab>("topup")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  const [loadingPkgId, setLoadingPkgId] = useState<string | null>(null)
  const [topUpUsd, setTopUpUsd] = useState(MIN_TOP_UP_USD)
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null)
  const [topUpError, setTopUpError] = useState<string | null>(null)

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setCredits(json.credits)
        setPending(Number(json.pendingCredits) || 0)
        setCanBuyCredits(Boolean(json.canBuyCredits))
        setPurchaseOnly(Boolean(json.purchaseOnly))
        setPurchaseWindowExpiresAt(json.purchaseWindowExpiresAt || null)
        setHasStudioAccess(true)
      } else {
        setHasStudioAccess(false)
        setCanBuyCredits(false)
        setPurchaseOnly(false)
        setPurchaseWindowExpiresAt(null)
        setShowModal(false)
      }
    } catch (err) {
      setHasStudioAccess(false)
      setCanBuyCredits(false)
      setShowModal(false)
      console.warn("Could not fetch credits:", err)
    }
  }

  useEffect(() => {
    setHasStudioAccess(false)
    setShowModal(false)
    if (!user) return
    fetchCredits()
    const handleBalanceChanged = (event: Event) => {
      const balance = (event as CustomEvent<{ balance?: number }>).detail?.balance
      if (typeof balance === "number") setCredits(balance)
      else void fetchCredits()
    }
    window.addEventListener(creditBalanceChangedEvent, handleBalanceChanged)
    const interval = setInterval(fetchCredits, 15_000)
    return () => {
      window.removeEventListener(creditBalanceChangedEvent, handleBalanceChanged)
      clearInterval(interval)
    }
  }, [user?.id])

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const handleTopUp = async (amountUsd: number) => {
    const amountInr = Math.ceil(amountUsd * INR_PER_USD)
    const purchaseId = String(amountUsd)
    setLoadingPkgId(purchaseId)
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
        description: `${data.credits.toLocaleString()} Generation Credits (${formatUsd(amountInr)})`,
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

  if (!user || !hasStudioAccess) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`group flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-3 text-xs font-bold text-[#b9f42e] transition hover:bg-[#b9f42e] hover:text-black ${className || ""}`}
        title="Click to top up AI Generation Credits via Razorpay."
      >
        <Zap className="h-3.5 w-3.5 fill-[#b9f42e] group-hover:fill-black" />
        <span>{credits !== null ? `${credits.toLocaleString()} Credits` : "Loading..."}</span>
        {pending > 0 && (
          <span
            className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 group-hover:bg-black/10"
            title={`${pending.toLocaleString()} credits are committed to generations still running`}
          >
            {pending.toLocaleString()} pending
          </span>
        )}
        <Plus className="h-3 w-3 opacity-70 group-hover:opacity-100" />
      </button>

      {/*
        Rendered through a portal: the Navbar wrapper uses backdrop-filter, which
        makes it the containing block for fixed-position descendants and would
        anchor this overlay to the navbar box instead of the viewport.
      */}
      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className={`relative max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-[#121412] p-6 text-white shadow-2xl ${tab === "topup" ? "max-w-md" : "max-w-3xl"}`}>
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#b9f42e]/15 text-[#b9f42e]">
                <Zap className="h-6 w-6 fill-[#b9f42e]" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Generation Credits</h3>
                <p className="text-xs text-zinc-400">
                  {credits !== null ? `${credits.toLocaleString()} credits available` : "Loading balance…"}
                  {pending > 0 && ` · ${pending.toLocaleString()} committed to generations still running`}
                </p>
              </div>
            </div>

            <div className="mb-5 flex gap-1 border-b border-white/[0.08]">
              {accountTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
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
            purchaseOnly && purchaseWindowExpiresAt ? (
              <StudioCreditOffer
                expiresAt={purchaseWindowExpiresAt}
                onPurchased={() => void fetchCredits()}
              />
            ) : (
            <>
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

            {canBuyCredits ? (
              <div className="mb-6 space-y-4 rounded-xl border border-white/10 bg-white/[.03] p-4">
                <div>
                  <label htmlFor="credit-topup-usd" className="text-sm font-semibold">Choose your top-up amount</label>
                  <p className="mt-1 text-xs text-zinc-400">Minimum {formatUsd(MIN_TOP_UP_USD * INR_PER_USD)} · about {Math.ceil(MIN_TOP_UP_USD * INR_PER_USD).toLocaleString()} credits</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 25, 50].map((amount) => (
                    <button key={amount} type="button" onClick={() => setTopUpUsd(amount)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${topUpUsd === amount ? "border-[#b9f42e] bg-[#b9f42e] text-black" : "border-white/10 bg-white/5 text-white hover:border-white/20"}`}>
                      ${amount}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-sm font-bold text-[#b9f42e]">$</span>
                    <input id="credit-topup-usd" type="number" min={MIN_TOP_UP_USD} step="1" value={topUpUsd} onChange={(event) => setTopUpUsd(Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border border-white/15 bg-black/50 py-2.5 pl-8 pr-3 text-sm font-semibold text-white outline-none focus:border-[#b9f42e]" />
                  </div>
                  <button disabled={loadingPkgId !== null || !Number.isFinite(topUpUsd) || topUpUsd < MIN_TOP_UP_USD} onClick={() => void handleTopUp(topUpUsd)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#b9f42e] px-4 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
                    {loadingPkgId !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Buy credits · {formatUsd(Math.ceil(topUpUsd * INR_PER_USD))}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-white/10 bg-white/[.03] p-4 text-sm text-zinc-400">
                An active subscription is required to buy additional credits.
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center text-[11px] text-zinc-400">
              🔒 Powered by Razorpay. Full access to AI Video & Image generation.
            </div>
            </>
            )
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
