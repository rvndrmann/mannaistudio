"use client"

import { Check, Crown, Loader2, Sparkles } from "lucide-react"
import { SEASON_PASS_DAYS, earlyPassTimeRemaining, type SeasonPassOffer } from "@/lib/originals"
import { useSeasonPassCheckout } from "./use-season-pass-checkout"

/**
 * The season pass, sold from the series page.
 *
 * The paywall could not carry a presale on its own. It is drawn over a locked
 * episode, and a presale runs before the paid episodes exist — three free
 * episodes out of a planned eight means nothing on the series is locked, the
 * paywall never appears, and the launch price has nowhere to be bought. This
 * is that missing surface: the pass, on the page people are sent to when they
 * hear about the show, whether or not a single paid episode has been published.
 *
 * It also states what the money buys during a presale, which is not the same
 * promise as the paywall's. There, the next episode is one tap away. Here, the
 * viewer is paying for episodes that have not been released yet, so the card
 * says how many are still to come rather than implying they can watch now.
 */
type Props = {
  seriesId: string
  seriesTitle: string
  offer: SeasonPassOffer
  /** Episodes published so far, and the announced length of the season. */
  episodeCount: number
  plannedEpisodes: number | null
  freeEpisodes: number
  /** Set while this viewer already holds a pass — then there is nothing to sell. */
  passExpiresAt: string | null
  signedIn: boolean
  onSignIn: () => void
  onPurchased: () => void
}

function passUntil(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export default function SeasonPassCard({
  seriesId, seriesTitle, offer, episodeCount, plannedEpisodes, freeEpisodes,
  passExpiresAt, signedIn, onSignIn, onPurchased,
}: Props) {
  const { buyPass, pending, error } = useSeasonPassCheckout({ onPurchased })

  const offerEnds = earlyPassTimeRemaining(offer.endsAt)
  const onOffer = offer.priceInr < offer.fullPriceInr && offerEnds !== null
  const stillToCome = Math.max((plannedEpisodes ?? 0) - episodeCount, 0)
  const hasPaidEpisodes = episodeCount > freeEpisodes || (plannedEpisodes ?? 0) > freeEpisodes

  // A pass already held, and a series with nothing to charge for, are both
  // reasons to say nothing rather than to advertise.
  if (passExpiresAt) {
    return (
      <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/[0.07] px-4 py-3">
        <Check className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-white/75">
          <span className="font-semibold text-white">Season pass active</span>
          {" — every episode until "}{passUntil(passExpiresAt)}.
        </p>
      </div>
    )
  }
  if (!hasPaidEpisodes && !onOffer) return null

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {onOffer && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3 w-3" />
          Early pass · {offerEnds}
        </div>
      )}

      <p className="text-sm font-semibold text-white">
        {onOffer ? "Get the whole season, before it's out" : "Watch the whole season"}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/55">
        Every episode of {seriesTitle} for {SEASON_PASS_DAYS} days
        {stillToCome > 0 ? `, including the ${stillToCome} still to come` : ""}. No credits needed.
      </p>

      <button
        type="button"
        onClick={() => (signedIn ? void buyPass(seriesId) : onSignIn())}
        disabled={pending}
        className="mt-3.5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-[15px] font-bold text-black transition hover:brightness-110 disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <>
            <Crown className="h-5 w-5" />
            {onOffer ? "Early pass" : "Season Pass"} — ₹{offer.priceInr}
            {onOffer && (
              <span className="text-[13px] font-semibold text-black/45 line-through">₹{offer.fullPriceInr}</span>
            )}
          </>
        )}
      </button>

      {onOffer && (
        <p className="mt-2 text-[12px] text-white/45">₹{offer.fullPriceInr} once the presale closes.</p>
      )}
      {error && <p className="mt-2 text-[12px] font-medium text-red-300">{error}</p>}
    </div>
  )
}
