import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { DEFAULT_EPISODE_PRICE, DEFAULT_FREE_EPISODES, type OriginalsSeriesSummary } from "@/lib/originals"

export const dynamic = "force-dynamic"

/**
 * The Originals catalogue.
 *
 * Served from the service client rather than read straight from the browser,
 * because `originals_episodes` holds the thing being sold. RLS filters rows,
 * not columns — a policy that let a visitor list episodes would hand them
 * `video_url` along with the row. So the columns are chosen here, and
 * `video_url` is not among them.
 */
export async function GET() {
  try {
    const admin = createServiceClient()

    const { data: series, error } = await admin
      .from("originals_series")
      .select("id, slug, title, description, poster_url, banner_url, genre, tags, free_episodes, episode_price")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })

    if (error) throw new Error(error.message)

    const seriesIds = (series || []).map((row) => row.id)
    const counts = new Map<string, number>()
    if (seriesIds.length > 0) {
      const { data: episodes } = await admin
        .from("originals_episodes")
        .select("series_id")
        .eq("is_published", true)
        .in("series_id", seriesIds)
      for (const episode of episodes || []) {
        counts.set(episode.series_id, (counts.get(episode.series_id) || 0) + 1)
      }
    }

    const catalogue: OriginalsSeriesSummary[] = (series || []).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      posterUrl: row.poster_url,
      bannerUrl: row.banner_url,
      genre: row.genre,
      tags: Array.isArray(row.tags) ? row.tags : [],
      freeEpisodes: row.free_episodes ?? DEFAULT_FREE_EPISODES,
      episodePrice: row.episode_price ?? DEFAULT_EPISODE_PRICE,
      episodeCount: counts.get(row.id) || 0,
    }))

    // The balance travels with the catalogue so the page can price a locked
    // episode against what the viewer actually holds, without a second request.
    // Signed out is an ordinary state here — the catalogue is public.
    let credits: number | null = null
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .maybeSingle()
      credits = Number(profile?.credits_balance ?? 0)
    }

    return NextResponse.json({ series: catalogue, credits })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load Originals" },
      { status: 500 },
    )
  }
}
