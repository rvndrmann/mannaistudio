/**
 * Originals — episodic series watched with generation credits.
 *
 * The viewer packs are smaller than the studio top-ups in
 * `credits-packages.ts`, and deliberately so. A studio top-up starts at 1,000
 * credits because it is bought by someone rendering video; a viewer who wants
 * to finish one series needs a few hundred, and being told the minimum is
 * ₹1,000 is where they stop. Same rate as everywhere else on the platform:
 * 1 credit = ₹1, so the two ladders never disagree about what a credit is worth.
 */

export const ORIGINALS_CREDIT_PACKAGES: Record<string, { credits: number; priceInr: number; episodes: number }> = {
  "10": { credits: 10, priceInr: 10, episodes: 1 },
  "50": { credits: 50, priceInr: 50, episodes: 5 },
  "200": { credits: 200, priceInr: 200, episodes: 20 },
  "500": { credits: 500, priceInr: 500, episodes: 50 },
}

/**
 * Fallbacks for a series row that predates the per-series columns.
 *
 * Display only. What a viewer is actually charged is `episode_price` on the
 * series row, read inside the unlock function — so this constant and that
 * column have to be moved together or the paywall quotes one price and the
 * balance loses another.
 */
export const DEFAULT_EPISODE_PRICE = 10
export const DEFAULT_FREE_EPISODES = 3

/**
 * The season pass: one series, thirty days, bought with money rather than
 * credits so that someone with an empty balance can still say yes.
 *
 * It expires deliberately. A permanent pass on a login shared around a group
 * is a viewer who never comes back, and keeping them is the point of the offer.
 */
export const SEASON_PASS_PRICE_INR = 49
export const SEASON_PASS_DAYS = 30

/**
 * Launch offers — a season pass sold under its standing price for the first
 * few days of a series, keyed by slug.
 *
 * A season that drops all at once has one week when everybody who is ever
 * going to hear about it hears about it, and the pass is what turns that
 * attention into a viewer who finishes the show. Nineteen rupees is under the
 * smallest credit pack, so during the window the pass is the cheapest thing on
 * the paywall rather than the biggest commitment on it.
 *
 * `endsAt` is an instant, not a duration, so every viewer sees the same
 * deadline whatever their clock says and the offer cannot quietly run on. To
 * extend or end one early, move this date — it is the only place the window
 * is written down.
 */
export const EARLY_PASS_OFFERS: Record<string, { priceInr: number; endsAt: string }> = {
  // Full season out this week. Back to ₹49 at midnight IST ending 14 Sep 2026.
  "dil-ka-sauda-1980": { priceInr: 19, endsAt: "2026-09-14T18:30:00.000Z" },
}

export type SeasonPassOffer = {
  /** What this viewer is charged right now, in rupees. */
  priceInr: number
  /** The standing price. Equal to `priceInr` when no offer is running. */
  fullPriceInr: number
  /** When the offer closes, or null when the price is simply the standing one. */
  endsAt: string | null
}

/**
 * What a season pass costs for one series at one moment.
 *
 * The server calls this to price the Razorpay order and again to tell the
 * paywall what to print, so the label and the charge cannot disagree: both
 * come from the same function reading the same clock.
 */
export function seasonPassOffer(slug: string | null | undefined, now: number = Date.now()): SeasonPassOffer {
  const standing = { priceInr: SEASON_PASS_PRICE_INR, fullPriceInr: SEASON_PASS_PRICE_INR, endsAt: null }
  const offer = slug ? EARLY_PASS_OFFERS[slug] : undefined
  if (!offer) return standing
  const closes = new Date(offer.endsAt).getTime()
  if (!Number.isFinite(closes) || closes <= now) return standing
  return { priceInr: offer.priceInr, fullPriceInr: SEASON_PASS_PRICE_INR, endsAt: offer.endsAt }
}

/**
 * "2 days left" on a launch offer, in hours once it is down to the last day —
 * a deadline is only persuasive while it is legible, and "1 day left" covers
 * anything from an hour to twenty-four.
 */
export function earlyPassTimeRemaining(endsAt: string | null, now: number = Date.now()): string | null {
  if (!endsAt) return null
  const msLeft = new Date(endsAt).getTime() - now
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null
  if (msLeft <= 3_600_000) return "Ends within the hour"
  if (msLeft <= 86_400_000) return `${Math.ceil(msLeft / 3_600_000)} hours left`
  return `${Math.ceil(msLeft / 86_400_000)} days left`
}

export type OriginalsSeriesSummary = {
  id: string
  slug: string
  title: string
  description: string | null
  posterUrl: string | null
  bannerUrl: string | null
  genre: string | null
  tags: string[]
  freeEpisodes: number
  episodePrice: number
  episodeCount: number
  /**
   * How long the finished season will be, when that has been decided. Numbers
   * past what is published are drawn as "coming soon" and can be waited on.
   */
  plannedEpisodes: number | null
}

/**
 * An episode as the browser is allowed to see it — everything needed to render
 * the list, and never `video_url`. The playable URL is what the credit buys, so
 * it is released only by the unlock route.
 */
export type OriginalsEpisodeSummary = {
  id: string
  episodeNumber: number
  title: string
  description: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  /** Inside the series' free window — plays without spending anything. */
  isFree: boolean
  /** Bought by this viewer and still inside its window. */
  isUnlocked: boolean
  /**
   * When this viewer's access to the episode lapses — the rental's own expiry,
   * or the season pass's when one is covering it. Null when access has no end:
   * a free episode, a locked one, or an unlock sold before the rental window
   * existed.
   */
  unlockExpiresAt: string | null
}

/** How long a bought episode stays playable. Mirrors originals_unlock_window(). */
export const UNLOCK_WINDOW_DAYS = 60

/**
 * "12 days left" for a rental that is running out.
 *
 * Returns null when there is nothing worth saying — no expiry at all, or one
 * far enough away that a countdown is just noise on the page. The warning is
 * the point; a permanent-looking label on day one is not.
 */
export function unlockTimeRemaining(expiresAt: string | null, warnWithinDays = 14): string | null {
  if (!expiresAt) return null
  const msLeft = new Date(expiresAt).getTime() - Date.now()
  if (Number.isNaN(msLeft) || msLeft <= 0) return "Expired"
  const daysLeft = Math.ceil(msLeft / 86_400_000)
  if (daysLeft > warnWithinDays) return null
  if (daysLeft === 1) return "Last day"
  return `${daysLeft} days left`
}

export type OriginalsSeriesDetail = OriginalsSeriesSummary & {
  episodes: OriginalsEpisodeSummary[]
  /** Announced-but-unreleased episode numbers, in order. Empty when the season is complete. */
  upcomingEpisodes: number[]
  /** ISO timestamp while a season pass is live for this viewer, else null. */
  passExpiresAt: string | null
  /** What a pass costs today — priced on the server so the paywall cannot quote its own number. */
  seasonPass: SeasonPassOffer
}

export function formatEpisodeDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ""
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest}s`
  return `${minutes}m ${String(rest).padStart(2, "0")}s`
}

/**
 * The episode numbers a viewer can ask to be told about: everything between the
 * last published episode and the end of the announced season.
 */
export function upcomingEpisodeNumbers(published: number[], plannedEpisodes: number | null): number[] {
  if (!plannedEpisodes || plannedEpisodes <= 0) return []
  const out: number[] = []
  const have = new Set(published)
  for (let n = 1; n <= plannedEpisodes; n += 1) {
    if (!have.has(n)) out.push(n)
  }
  return out
}
