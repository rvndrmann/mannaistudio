"use client"

import { useState } from "react"
import { Check, Loader2, Lock, Zap } from "lucide-react"
import { useCreditPackCheckout } from "./use-credit-pack-checkout"
import {
  ORIGINALS_CREDIT_PACKAGES,
  type OriginalsEpisodeSummary,
} from "@/lib/originals"

/**
 * The paywall, drawn inside the player frame.
 *
 * Everything happens here. The brief that shaped it: a viewer who runs out mid
 * episode should never be sent to a billing page, because leaving the player is
 * where they stop coming back. So the pass, the one-off unlock and the credit
 * packs are all on this screen, and the only thing that ever navigates away is
 * Razorpay's own modal.
 *
 * Sized for a phone held upright, which is where nearly all of this traffic is:
 * one column, nothing below the fold that matters, targets at least 44px.
 */

type Props = {
  episode: OriginalsEpisodeSummary
  seriesId: string
  seriesTitle: string
  posterUrl: string | null
  episodePrice: number
  balance: number | null
  signedIn: boolean
  onSignIn: () => void
  /** Pay with credits already held. */
  onUnlock: () => void
  unlocking: boolean
  onBalanceChange: (balance: number) => void
  error?: string | null
}

export default function EpisodePaywall({
  episode, seriesTitle, posterUrl, episodePrice, balance, signedIn,
  onSignIn, onUnlock, unlocking, onBalanceChange, error,
}: Props) {
  const [showPacks, setShowPacks] = useState(false)

  const canAfford = (balance ?? 0) >= episodePrice
  const still = episode.thumbnailUrl || posterUrl


  // The line that has to make someone want the next four minutes. The episode's
  // own words if it has any, since a writer's hook beats a generated one.
  const hook = episode.description?.trim() || `${seriesTitle} — it doesn't stop here.`

  const { buyPack: startPackCheckout, pendingPackId, error: packError } = useCreditPackCheckout({
    onPurchased: (newBalance) => { onBalanceChange(newBalance); setShowPacks(false) },
  })

  const buyPack = (packageId: string) => {
    if (!signedIn) { onSignIn(); return }
    void startPackCheckout(packageId)
  }

  const shown = error || packError

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* The episode itself, blurred — what they are being kept from */}
      {still ? (
        <img src={still} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-90 blur-lg" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/70 to-black/95" />

      <div className="relative flex h-full flex-col justify-end overflow-y-auto px-5 pb-5 pt-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              <Lock className="h-3 w-3" />
              Episode {episode.episodeNumber}
            </span>
            <h2 className="mt-3 text-[22px] font-bold leading-tight text-white">{hook}</h2>
          </div>

          {canAfford ? (
            // Enough credits: one tap, no checkout in the way.
            <button
              type="button"
              onClick={onUnlock}
              disabled={unlocking}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Zap className="h-4 w-4 fill-current text-primary" />Unlock this episode ({episodePrice} credits)</>
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => (signedIn ? setShowPacks((v) => !v) : onSignIn())}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <Zap className="h-4 w-4 text-primary" />
                Unlock this episode ({episodePrice} credits)
              </button>
              <p className="mt-2 text-center text-[12px] text-white/45">
                {signedIn
                  ? `You have ${balance ?? 0} — top up below without leaving the episode.`
                  : "Sign in to use credits."}
              </p>

              {/* Packs, inline: leaving the player is where people stop. */}
              {showPacks && signedIn && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {Object.entries(ORIGINALS_CREDIT_PACKAGES).map(([id, pack]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => buyPack(id)}
                      disabled={pendingPackId !== null}
                      className="min-h-[64px] rounded-xl border border-white/15 bg-white/[0.04] px-2 py-2.5 text-center transition hover:border-primary/60 disabled:opacity-60"
                    >
                      {pendingPackId === id ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin text-white/70" />
                      ) : (
                        <>
                          <span className="block text-sm font-bold text-white">{pack.credits}</span>
                          <span className="mt-0.5 block text-[11px] text-white/45">₹{pack.priceInr}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {signedIn && canAfford && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/45">
              <Check className="h-3.5 w-3.5 text-primary" />
              Balance {balance ?? 0} credits
            </p>
          )}

          {shown && <p className="mt-3 text-center text-[12px] font-medium text-red-300">{shown}</p>}
        </div>
      </div>
    </div>
  )
}
