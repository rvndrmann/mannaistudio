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
  "200": { credits: 200, priceInr: 200, episodes: 10 },
  "500": { credits: 500, priceInr: 500, episodes: 25 },
  "1000": { credits: 1000, priceInr: 1000, episodes: 50 },
}

/** Fallbacks for a series row that predates the per-series columns. */
export const DEFAULT_EPISODE_PRICE = 25
export const DEFAULT_FREE_EPISODES = 3

/**
 * The season pass: one series, thirty days, bought with money rather than
 * credits so that someone with an empty balance can still say yes.
 *
 * It expires deliberately. A permanent pass on a login shared around a group
 * is a viewer who never comes back, and keeping them is the point of the offer.
 */
export const SEASON_PASS_PRICE_INR = 149
export const SEASON_PASS_DAYS = 30

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
  /** Already bought by this viewer. */
  isUnlocked: boolean
}

export type OriginalsSeriesDetail = OriginalsSeriesSummary & {
  episodes: OriginalsEpisodeSummary[]
  /** Announced-but-unreleased episode numbers, in order. Empty when the season is complete. */
  upcomingEpisodes: number[]
  /** ISO timestamp while a season pass is live for this viewer, else null. */
  passExpiresAt: string | null
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
