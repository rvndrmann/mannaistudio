import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Reads for the admin analytics section.
 *
 * One route over several functions rather than one route each, because they are
 * one screen and the only thing that varies is which question is being asked.
 * Called with the admin's own session — every function underneath checks
 * `admin_users` itself, so there is a single place that decides who may read
 * this and it is not here.
 *
 * The service key is deliberately not used. These functions return the browsing
 * history of named people; routing them through the caller's own session means
 * a missing admin row fails closed rather than fails open.
 */

const VIEWS = ["overview", "traffic", "live", "retention", "viewers", "purchases", "episode", "history"] as const
type View = (typeof VIEWS)[number]

function isView(value: string | null): value is View {
  return value !== null && (VIEWS as readonly string[]).includes(value)
}

/** A bounded positive integer from a query string, or the fallback. */
function intParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const params = request.nextUrl.searchParams
    const view = params.get("view")
    if (!isView(view)) {
      return NextResponse.json({ error: "Unknown view" }, { status: 400 })
    }

    const days = intParam(params.get("days"), 30, 365)
    const seriesId = params.get("seriesId") || null
    const episodeId = params.get("episodeId") || null
    const profileId = params.get("profileId") || null
    const visitorId = params.get("visitorId") || null
    const search = params.get("search") || null

    let result
    switch (view) {
      case "overview":
        result = await supabase.rpc("admin_analytics_overview", { p_days: days })
        break
      case "traffic":
        result = await supabase.rpc("admin_analytics_traffic", { p_days: days })
        break
      case "live":
        result = await supabase.rpc("admin_analytics_live")
        break
      case "retention":
        result = await supabase.rpc("admin_analytics_episode_retention", { p_series_id: seriesId })
        break
      case "viewers":
        result = await supabase.rpc("admin_analytics_viewers", {
          p_days: days,
          p_limit: intParam(params.get("limit"), 200, 1000),
          p_search: search,
        })
        break
      case "purchases":
        result = await supabase.rpc("admin_analytics_purchases", {
          p_days: days,
          p_limit: intParam(params.get("limit"), 300, 1000),
        })
        break
      case "episode":
        if (!episodeId) return NextResponse.json({ error: "An episode is required" }, { status: 400 })
        result = await supabase.rpc("admin_analytics_episode_viewers", {
          p_episode_id: episodeId,
          p_limit: intParam(params.get("limit"), 200, 1000),
        })
        break
      case "history":
        if (!profileId && !visitorId) {
          return NextResponse.json({ error: "A viewer is required" }, { status: 400 })
        }
        result = await supabase.rpc("admin_analytics_viewer_history", {
          p_profile_id: profileId,
          p_visitor_id: visitorId,
          p_limit: intParam(params.get("limit"), 100, 500),
        })
        break
    }

    if (result.error) {
      // "Admin access required" comes back from the function itself; surfacing
      // it as a 403 keeps that distinguishable from a broken query.
      const forbidden = result.error.message.includes("Admin access required")
      return NextResponse.json({ error: result.error.message }, { status: forbidden ? 403 : 400 })
    }

    // `admin_analytics_overview` returns exactly one row; everything else is a
    // list. Unwrapping here keeps the component from having to know which.
    const data = result.data
    if (view === "overview") {
      return NextResponse.json({ overview: Array.isArray(data) ? data[0] ?? null : data })
    }
    return NextResponse.json({ rows: data || [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load analytics" },
      { status: 500 },
    )
  }
}
