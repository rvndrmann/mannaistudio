import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import {
  DEFAULT_EPISODE_PRICE,
  DEFAULT_FREE_EPISODES,
  type OriginalsEpisodeSummary,
  type OriginalsSeriesDetail,
} from "@/lib/originals"

export const dynamic = "force-dynamic"

/**
 * One series and its episode list.
 *
 * Same rule as the catalogue: `video_url` is never selected here. Each episode
 * carries only whether it is free and whether this viewer has already bought
 * it — enough to draw a lock, not enough to get past one.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const admin = createServiceClient()

    const { data: series, error } = await admin
      .from("originals_series")
      .select("id, slug, title, description, poster_url, banner_url, genre, tags, free_episodes, episode_price")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 })

    const { data: episodeRows } = await admin
      .from("originals_episodes")
      .select("id, episode_number, title, description, thumbnail_url, duration_seconds")
      .eq("series_id", series.id)
      .eq("is_published", true)
      .order("episode_number", { ascending: true })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let credits: number | null = null
    const unlockedIds = new Set<string>()
    if (user) {
      const [{ data: profile }, { data: unlocks }] = await Promise.all([
        admin.from("profiles").select("credits_balance").eq("id", user.id).maybeSingle(),
        admin
          .from("originals_unlocks")
          .select("episode_id")
          .eq("profile_id", user.id)
          .in("episode_id", (episodeRows || []).map((row) => row.id)),
      ])
      credits = Number(profile?.credits_balance ?? 0)
      for (const unlock of unlocks || []) unlockedIds.add(unlock.episode_id)
    }

    const freeEpisodes = series.free_episodes ?? DEFAULT_FREE_EPISODES
    const episodes: OriginalsEpisodeSummary[] = (episodeRows || []).map((row) => ({
      id: row.id,
      episodeNumber: row.episode_number,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      durationSeconds: row.duration_seconds,
      isFree: row.episode_number <= freeEpisodes,
      isUnlocked: unlockedIds.has(row.id),
    }))

    const detail: OriginalsSeriesDetail = {
      id: series.id,
      slug: series.slug,
      title: series.title,
      description: series.description,
      posterUrl: series.poster_url,
      bannerUrl: series.banner_url,
      genre: series.genre,
      tags: Array.isArray(series.tags) ? series.tags : [],
      freeEpisodes,
      episodePrice: series.episode_price ?? DEFAULT_EPISODE_PRICE,
      episodeCount: episodes.length,
      episodes,
    }

    return NextResponse.json({ series: detail, credits, signedIn: Boolean(user) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load this series" },
      { status: 500 },
    )
  }
}
