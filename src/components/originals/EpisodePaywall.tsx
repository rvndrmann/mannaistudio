"use client"

import { useState } from "react"
import { Check, Crown, Loader2, Lock, Sparkles, Zap } from "lucide-react"
import { useCreditPackCheckout } from "./use-credit-pack-checkout"
import { useSeasonPassCheckout } from "./use-season-pass-checkout"
import {
  ORIGINALS_CREDIT_PACKAGES,
  SEASON_PASS_DAYS,
  SEASON_PASS_PRICE_INR,
  earlyPassTimeRemaining,
  type OriginalsEpisodeSummary,
  type SeasonPassOffer,
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
  /**
   * What the pass costs today, priced by the server. Optional so an older
   * caller still renders — at the standing price, never at an offer one.
   */
  seasonPass?: SeasonPassOffer
  balance: number | null
  signedIn: boolean
  onSignIn: () => void
  /** Pay with credits already held. */
  onUnlock: () => void
  unlocking: boolean
  onBalanceChange: (balance: number) => void
  /** A pass was bought; the parent re-reads the series and starts playing. */
  onPassPurchased: () => void
  error?: string | null
}

export default function EpisodePaywall({
  episode, seriesId, seriesTitle, posterUrl, episodePrice, seasonPass, balance, signedIn,
  onSignIn, onUnlock, unlocking, onBalanceChange, onPassPurchased, error,
}: Props) {
  const [showPacks, setShowPacks] = useState(false)

  const canAfford = (balance ?? 0) >= episodePrice
  const still = episode.thumbnailUrl || posterUrl

  // A launch offer is only worth drawing while it is still running and still
  // cheaper than the standing price; past that this is an ordinary pass button.
  const pass = seasonPass ?? { priceInr: SEASON_PASS_PRICE_INR, fullPriceInr: SEASON_PASS_PRICE_INR, endsAt: null }
  const offerEnds = earlyPassTimeRemaining(pass.endsAt)
  const onOffer = pass.priceInr < pass.fullPriceInr && offerEnds !== null

  // The line that has to make someone want the next four minutes. The episode's
  // own words if it has any, since a writer's hook beats a generated one.
  const hook = episode.description?.trim() || `${seriesTitle} — it doesn't stop here.`

  // The pass and the packs are two different purchases from two different
  // endpoints, so each has its own checkout hook.
  const { buyPass: startPassCheckout, pending: passPending, error: passError } = useSeasonPassCheckout({
    onPurchased: onPassPurchased,
  })

  const buyPass = () => {
    if (!signedIn) { onSignIn(); return }
    void startPassCheckout(seriesId)
  }

  // Packs go through the shared checkout; the season pass above does not,
  // because it buys a different thing from a different endpoint.
  const { buyPack: startPackCheckout, pendingPackId, error: packError } = useCreditPackCheckout({
    onPurchased: (newBalance) => { onBalanceChange(newBalance); setShowPacks(false) },
  })

  const buyPack = (packageId: string) => {
    if (!signedIn) { onSignIn(); return }
    void startPackCheckout(packageId)
  }

  const shown = error || passError || packError

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

          {/* The launch price, and how long it lasts — the deadline is the offer */}
          {onOffer && (
            <div className="mb-2 flex items-center justify-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" />
              Early pass · {offerEnds}
            </div>
          )}

          {/* Primary: the pass */}
          <button
            type="button"
            onClick={buyPass}
            disabled={passPending}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-[15px] font-bold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {passPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <Crown className="h-5 w-5" />
                Season Pass — ₹{pass.priceInr}
                {onOffer && (
                  <span className="text-[13px] font-semibold text-black/45 line-through">₹{pass.fullPriceInr}</span>
                )}
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[12px] leading-relaxed text-white/50">
            Every episode of {seriesTitle}, for {SEASON_PASS_DAYS} days. No credits needed.
            {onOffer ? ` ₹${pass.fullPriceInr} once the launch window closes.` : ""}
          </p>

          {/* Secondary: this one episode */}
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-wide text-white/30">or</span>
            <span className="h-px flex-1 bg-white/10" />
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
