"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircle, Check, CreditCard, Loader2, Play, X, Zap } from "lucide-react"
import { ORIGINALS_CREDIT_PACKAGES } from "@/lib/originals"
import { formatUsdWithInr } from "@/lib/currency"
import { useCreditPackCheckout } from "./use-credit-pack-checkout"

/**
 * The viewer's top-up sheet.
 *
 * Packs are labelled in episodes as well as credits, because that is the unit
 * the decision is actually made in: someone four episodes into a series is
 * asking "how many more can I watch", not "how many credits do I want".
 */
export default function CreditPackModal({
  open,
  onClose,
  balance,
  onPurchased,
  episodePrice,
}: {
  open: boolean
  onClose: () => void
  balance: number | null
  onPurchased: (newBalance: number) => void
  episodePrice: number
}) {
  const [success, setSuccess] = useState<string | null>(null)
  const { buyPack, pendingPackId: loadingPackId, error } = useCreditPackCheckout({
    onPurchased,
    onSuccess: setSuccess,
  })

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#121412] p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Zap className="h-6 w-6 fill-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Get Credits</h3>
            <p className="text-xs text-zinc-400">
              {balance !== null ? `${balance.toLocaleString()} credits available` : "Loading balance…"}
              {" · "}
              {episodePrice} credits per episode
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 p-3 text-xs font-semibold text-primary">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-xs font-semibold text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(ORIGINALS_CREDIT_PACKAGES).map(([id, pack]) => {
            const popular = id === "500"
            return (
              <div
                key={id}
                className={`flex items-center justify-between rounded-xl border p-4 transition ${
                  popular ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{pack.credits.toLocaleString()} Credits</span>
                    {popular && (
                      <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                        Best value
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                    <Play className="h-3 w-3" />
                    about {Math.floor(pack.credits / episodePrice)} episodes
                  </p>
                </div>

                <button
                  type="button"
                  disabled={loadingPackId !== null}
                  onClick={() => buyPack(id)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {loadingPackId === id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-3 w-3" />
                      {formatUsdWithInr(pack.priceInr)}
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-3 text-center text-[11px] text-zinc-400">
          🔒 Secure checkout by Razorpay. Credits never expire.
        </div>
      </div>
    </div>,
    document.body,
  )
}
