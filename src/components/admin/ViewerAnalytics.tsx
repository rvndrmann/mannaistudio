"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity, ChevronDown, CreditCard, Eye, Film, Loader2, Radio,
  RefreshCw, Repeat, Search, TrendingUp, Users, Wallet,
} from "lucide-react"
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * Who watched what, how far they got, who paid, and who is here right now.
 *
 * Every number on this screen comes from `admin_analytics_*`, which check
 * `admin_users` themselves — so this component never decides who may see it.
 * The gate is the admin page it is mounted inside plus those functions.
 *
 * "A viewer" here is an account when there is one and a browser when there is
 * not. The opening episodes play with no sign-in, so counting only accounts
 * would report that nobody watches the free episodes — which is exactly
 * backwards, since that is where the audience is decided.
 */

type Overview = {
  live_now: number
  live_watching: number
  live_signed_in: number
  visitors: number
  sessions: number
  page_views: number
  signed_in_visitors: number
  returning_visitors: number
  visitors_today: number
  visitors_previous_period: number
  episode_views: number
  episode_watchers: number
  episodes_completed: number
  avg_percent_watched: number | null
  paid_unlocks: number
  paying_viewers: number
  credits_spent: number
  season_passes: number
  pass_revenue_inr: number
}

type TrafficDay = {
  day: string
  visitors: number
  sessions: number
  page_views: number
  episode_views: number
  paid_unlocks: number
  credits_spent: number
}

type LiveRow = {
  session_id: string
  visitor_id: string
  profile_id: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  device: string | null
  path: string | null
  started_at: string
  last_seen_at: string
  series_title: string | null
  episode_number: number | null
  percent_watched: number | null
}

type RetentionRow = {
  episode_id: string
  series_id: string
  series_title: string
  episode_number: number
  episode_title: string
  is_published: boolean
  is_free: boolean
  duration_seconds: number | null
  views: number
  viewers: number
  signed_in_viewers: number
  avg_percent: number | null
  completions: number
  reached_25: number
  reached_50: number
  reached_75: number
  reached_95: number
  continued_to_next: number
  paid_unlocks: number
  credits_earned: number
}

type EpisodeViewer = {
  profile_id: string | null
  visitor_id: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  views: number
  first_watched_at: string
  last_watched_at: string
  seconds_watched: number
  percent_watched: number
  completed: boolean
  access: string
  credits_spent: number | null
  paid_at: string | null
  unlock_expires_at: string | null
}

type ViewerRow = {
  profile_id: string | null
  visitor_id: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  first_seen_at: string
  last_seen_at: string
  sessions: number
  page_views: number
  episodes_watched: number
  episodes_completed: number
  episodes_after_first_visit: number
  watch_days: number
  seconds_watched: number
  paid_episodes: number
  credits_spent: number
  season_passes: number
  credits_balance: number | null
  last_series_title: string | null
  last_episode_number: number | null
}

type HistoryRow = {
  kind: string
  happened_at: string
  session_id: string
  series_title: string | null
  episode_number: number | null
  episode_title: string | null
  percent_watched: number | null
  seconds_watched: number | null
  completed: boolean | null
  access: string | null
  path: string | null
  device: string | null
}

type PurchaseRow = {
  kind: string
  profile_id: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  series_title: string | null
  episode_number: number | null
  episode_title: string | null
  credits_spent: number | null
  price_inr: number | null
  purchased_at: string
  expires_at: string | null
  watched: boolean | null
  percent_watched: number | null
}

type SeriesOption = { id: string; title: string }

type Section = "live" | "retention" | "viewers" | "payments"

/** How often the live panel re-asks. Comfortably inside the 2-minute window. */
const LIVE_REFRESH_MS = 15_000

async function loadView<T>(params: Record<string, string | number | null>): Promise<T[]> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value))
  }
  const res = await fetch(`/api/admin/analytics?${query}`, { cache: "no-store" })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Could not load analytics")
  return (data.rows || []) as T[]
}

function personName(row: { full_name: string | null; email: string | null; visitor_id: string | null }): string {
  if (row.full_name) return row.full_name
  if (row.email) return row.email
  // Signed-out viewers are real people with real watch histories; naming them
  // by a short slice of their browser id is enough to follow one down a list
  // without pretending to know who they are.
  return `Guest ${(row.visitor_id || "").slice(0, 8) || "unknown"}`
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

function percent(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

function StatTile({
  icon, label, value, hint, tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "live" | "money"
}) {
  return (
    <div className={cn(
      "glass-card rounded-2xl p-5 border-white/10",
      tone === "live" && "border-emerald-400/30 bg-emerald-400/[0.04]",
    )}>
      <div className="flex items-center gap-2 text-white/40">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn(
        "mt-3 text-3xl font-bold tabular-nums",
        tone === "live" && "text-emerald-400",
        tone === "money" && "text-primary",
      )}>{value}</p>
      {hint && <p className="mt-1 text-xs text-white/35">{hint}</p>}
    </div>
  )
}

/** The share of viewers still watching at each quarter of an episode. */
function DropOffBar({ row }: { row: RetentionRow }) {
  const marks = [
    { label: "25%", value: row.reached_25 },
    { label: "50%", value: row.reached_50 },
    { label: "75%", value: row.reached_75 },
    { label: "95%", value: row.reached_95 },
  ]
  return (
    <div className="flex items-end gap-1" title="Viewers still watching at each quarter">
      {marks.map((mark) => {
        const share = percent(mark.value, row.views)
        return (
          <div key={mark.label} className="flex w-8 flex-col items-center gap-1">
            <div className="flex h-10 w-full items-end rounded bg-white/[0.06]">
              <div
                className={cn(
                  "w-full rounded transition-all",
                  share >= 60 ? "bg-primary" : share >= 30 ? "bg-amber-400" : "bg-red-400/70",
                )}
                style={{ height: `${Math.max(share, 2)}%` }}
              />
            </div>
            <span className="text-[9px] text-white/30">{share}%</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ViewerAnalytics() {
  const supabase = useMemo(() => createClient(), [])

  const [section, setSection] = useState<Section>("live")
  const [days, setDays] = useState(30)
  const [error, setError] = useState<string | null>(null)

  const [overview, setOverview] = useState<Overview | null>(null)
  const [traffic, setTraffic] = useState<TrafficDay[]>([])
  const [live, setLive] = useState<LiveRow[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [viewers, setViewers] = useState<ViewerRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
  const [seriesFilter, setSeriesFilter] = useState<string>("")
  const [search, setSearch] = useState("")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Row drill-downs, each keyed by the row it belongs to so only one is open.
  const [openEpisode, setOpenEpisode] = useState<string | null>(null)
  const [episodeViewers, setEpisodeViewers] = useState<EpisodeViewer[]>([])
  const [loadingEpisode, setLoadingEpisode] = useState(false)
  const [openViewer, setOpenViewer] = useState<string | null>(null)
  const [viewerHistory, setViewerHistory] = useState<HistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const searchRef = useRef(search)
  searchRef.current = search

  const loadAll = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const [overviewRes, trafficRes, liveRes, retentionRes, viewersRes, purchasesRes] = await Promise.all([
        fetch(`/api/admin/analytics?view=overview&days=${days}`, { cache: "no-store" }).then((r) => r.json()),
        loadView<TrafficDay>({ view: "traffic", days }),
        loadView<LiveRow>({ view: "live" }),
        loadView<RetentionRow>({ view: "retention", seriesId: seriesFilter || null }),
        loadView<ViewerRow>({ view: "viewers", days, search: searchRef.current || null }),
        loadView<PurchaseRow>({ view: "purchases", days }),
      ])
      if (overviewRes.error) throw new Error(overviewRes.error)
      setOverview(overviewRes.overview)
      setTraffic(trafficRes)
      setLive(liveRes)
      setRetention(retentionRes)
      setViewers(viewersRes)
      setPurchases(purchasesRes)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days, seriesFilter])

  useEffect(() => { loadAll() }, [loadAll])

  // The series list for the filter comes straight from the table — admins read
  // it directly under RLS, so it needs no endpoint of its own.
  useEffect(() => {
    supabase
      .from("originals_series")
      .select("id, title")
      .order("sort_order")
      .then(({ data }) => setSeriesOptions((data as SeriesOption[]) || []))
  }, [supabase])

  // "Right now" has to keep being right, so the live panel refreshes itself
  // while it is the thing on screen — and stops when it isn't, because a
  // background poll every fifteen seconds for a panel nobody is looking at is
  // just load.
  useEffect(() => {
    if (section !== "live") return
    const tick = async () => {
      try {
        const [liveRows, overviewRes] = await Promise.all([
          loadView<LiveRow>({ view: "live" }),
          fetch(`/api/admin/analytics?view=overview&days=${days}`, { cache: "no-store" }).then((r) => r.json()),
        ])
        setLive(liveRows)
        if (!overviewRes.error) setOverview(overviewRes.overview)
      } catch { /* a missed poll corrects itself on the next one */ }
    }
    const timer = setInterval(tick, LIVE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [section, days])

  const showEpisodeViewers = async (episodeId: string) => {
    if (openEpisode === episodeId) { setOpenEpisode(null); return }
    setOpenEpisode(episodeId)
    setLoadingEpisode(true)
    try {
      setEpisodeViewers(await loadView<EpisodeViewer>({ view: "episode", episodeId }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load viewers")
      setEpisodeViewers([])
    } finally {
      setLoadingEpisode(false)
    }
  }

  const showViewerHistory = async (row: ViewerRow) => {
    const key = row.profile_id || row.visitor_id || ""
    if (openViewer === key) { setOpenViewer(null); return }
    setOpenViewer(key)
    setLoadingHistory(true)
    try {
      setViewerHistory(await loadView<HistoryRow>({
        view: "history",
        profileId: row.profile_id,
        visitorId: row.profile_id ? null : row.visitor_id,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history")
      setViewerHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const trend = useMemo(() => {
    if (!overview) return null
    const previous = overview.visitors_previous_period
    if (!previous) return null
    return Math.round(((overview.visitors - previous) / previous) * 100)
  }, [overview])

  const chartData = useMemo(
    () => traffic.map((d) => ({
      ...d,
      label: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    })),
    [traffic],
  )

  if (loading) {
    return (
      <div className="glass-card flex items-center justify-center gap-3 rounded-2xl p-16 text-white/40">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading analytics...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <header>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Audience</h1>
          <p className="text-sm text-white/40">
            Who is watching, how far they get, and what they pay for.
          </p>
        </header>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              onClick={() => setDays(option)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition",
                days === option ? "bg-primary text-black" : "bg-white/5 text-white/50 hover:bg-white/10",
              )}
            >
              {option}d
            </button>
          ))}
          <button
            onClick={() => loadAll()}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold transition hover:bg-white/20"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            tone="live"
            icon={<Radio className="h-4 w-4" />}
            label="Live now"
            value={overview.live_now}
            hint={`${overview.live_watching} watching · ${overview.live_signed_in} signed in`}
          />
          <StatTile
            icon={<Users className="h-4 w-4" />}
            label={`Visitors (${days}d)`}
            value={overview.visitors.toLocaleString()}
            hint={
              trend === null
                ? `${overview.visitors_today} today`
                : `${trend >= 0 ? "+" : ""}${trend}% vs previous ${days}d`
            }
          />
          <StatTile
            icon={<Eye className="h-4 w-4" />}
            label="Visits / pages"
            value={`${overview.sessions.toLocaleString()} / ${overview.page_views.toLocaleString()}`}
            hint={`${overview.returning_visitors} came back`}
          />
          <StatTile
            icon={<Film className="h-4 w-4" />}
            label="Episode views"
            value={overview.episode_views.toLocaleString()}
            hint={`${overview.episode_watchers} viewers · ${overview.episodes_completed} finished`}
          />
          <StatTile
            icon={<Activity className="h-4 w-4" />}
            label="Avg watched"
            value={overview.avg_percent_watched === null ? "—" : `${overview.avg_percent_watched}%`}
            hint="Share of an episode reached, on average"
          />
          <StatTile
            tone="money"
            icon={<Wallet className="h-4 w-4" />}
            label="Episodes bought"
            value={overview.paid_unlocks.toLocaleString()}
            hint={`${overview.paying_viewers} paying viewers`}
          />
          <StatTile
            tone="money"
            icon={<CreditCard className="h-4 w-4" />}
            label="Credits earned"
            value={overview.credits_spent.toLocaleString()}
            hint={`${overview.season_passes} passes · ₹${overview.pass_revenue_inr.toLocaleString()}`}
          />
          <StatTile
            icon={<Repeat className="h-4 w-4" />}
            label="Signed-in viewers"
            value={overview.signed_in_visitors.toLocaleString()}
            hint={`of ${overview.visitors.toLocaleString()} visitors`}
          />
        </div>
      )}

      {chartData.length > 0 && (
        <div className="glass-card rounded-2xl border-white/10 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">Traffic and watching</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b9f42e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b9f42e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="watchFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#12121a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#b9f42e" fill="url(#visitorsFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="episode_views" name="Episode views" stroke="#60a5fa" fill="url(#watchFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        {([
          ["live", "Live now", live.length],
          ["retention", "Episode retention", retention.length],
          ["viewers", "Viewers", viewers.length],
          ["payments", "Payments", purchases.length],
        ] as [Section, string, number][]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold transition",
              section === key ? "bg-primary text-black" : "bg-white/5 text-white/50 hover:bg-white/10",
            )}
          >
            {label} <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {section === "live" && (
        <div className="glass-card overflow-hidden rounded-2xl border-white/10">
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-6 py-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <h2 className="text-sm font-bold">
              {live.length} {live.length === 1 ? "person" : "people"} on the site
            </h2>
            <span className="ml-auto text-xs text-white/30">Refreshes every 15s</span>
          </div>
          {live.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-white/35">
              Nobody is on the site right now.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {live.map((row) => (
                <div key={row.session_id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-primary/15">
                    {row.avatar_url
                      ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <Users className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{personName(row)}</p>
                    <p className="truncate text-xs text-white/35">
                      {row.email || "Not signed in"} · {row.device || "unknown"}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {row.series_title ? (
                      <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">
                        Watching {row.series_title} E{row.episode_number}
                        {row.percent_watched !== null && ` · ${row.percent_watched}%`}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/45">
                        {row.path || "Browsing"}
                      </span>
                    )}
                    <span className="text-xs text-white/30">{timeAgo(row.last_seen_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "retention" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={seriesFilter}
              onChange={(e) => { setSeriesFilter(e.target.value); setOpenEpisode(null) }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
            >
              <option value="" className="bg-[#12121a]">All series</option>
              {seriesOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-[#12121a]">{option.title}</option>
              ))}
            </select>
            <p className="text-xs text-white/35">
              Click an episode to see exactly who watched it.
            </p>
          </div>

          {retention.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Film className="mx-auto mb-4 h-10 w-10 text-white/20" />
              <p className="text-white/40">No episodes to report on yet.</p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden rounded-2xl border-white/10">
              <div className="hidden gap-4 border-b border-white/[0.08] px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-white/35 lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]">
                <span>Episode</span>
                <span className="text-right">Views</span>
                <span className="text-right">Avg watched</span>
                <span className="text-right">Finished</span>
                <span className="text-right">Went to next</span>
                <span className="text-right">Paid</span>
                <span>Drop-off</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {retention.map((row) => (
                  <div key={row.episode_id}>
                    <button
                      onClick={() => showEpisodeViewers(row.episode_id)}
                      className="grid w-full grid-cols-1 items-center gap-4 px-6 py-4 text-left transition hover:bg-white/[0.03] lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronDown className={cn(
                          "h-4 w-4 shrink-0 text-white/30 transition",
                          openEpisode === row.episode_id && "rotate-180",
                        )} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {row.series_title} · E{row.episode_number}
                          </p>
                          <p className="truncate text-xs text-white/35">
                            {row.is_free ? "Free" : "Paid"} · {formatDuration(row.duration_seconds)}
                            {!row.is_published && " · Unpublished"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">{row.views}</p>
                        <p className="text-[11px] text-white/30">{row.viewers} people</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">
                          {row.avg_percent === null ? "—" : `${row.avg_percent}%`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">{percent(row.completions, row.views)}%</p>
                        <p className="text-[11px] text-white/30">{row.completions}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-bold tabular-nums",
                          percent(row.continued_to_next, row.viewers) >= 50 ? "text-primary" : "text-white/70",
                        )}>
                          {percent(row.continued_to_next, row.viewers)}%
                        </p>
                        <p className="text-[11px] text-white/30">{row.continued_to_next} people</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-primary">{row.paid_unlocks}</p>
                        <p className="text-[11px] text-white/30">{row.credits_earned} cr</p>
                      </div>
                      <DropOffBar row={row} />
                    </button>

                    {openEpisode === row.episode_id && (
                      <div className="border-t border-white/[0.06] bg-black/25 px-6 py-4">
                        {loadingEpisode ? (
                          <p className="flex items-center gap-2 text-sm text-white/40">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading viewers...
                          </p>
                        ) : episodeViewers.length === 0 ? (
                          <p className="text-sm text-white/35">Nobody has watched this episode yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {episodeViewers.map((viewer, index) => (
                              <div
                                key={`${viewer.profile_id || viewer.visitor_id}-${index}`}
                                className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-2.5"
                              >
                                <span className="text-sm font-medium">{personName(viewer)}</span>
                                {viewer.email && <span className="text-xs text-white/35">{viewer.email}</span>}
                                <span className={cn(
                                  "rounded px-2 py-0.5 text-[10px] font-bold",
                                  viewer.access === "free" ? "bg-white/10 text-white/50" : "bg-primary/15 text-primary",
                                )}>
                                  {viewer.access}
                                  {viewer.credits_spent ? ` · ${viewer.credits_spent} cr` : ""}
                                </span>
                                <div className="ml-auto flex items-center gap-3 text-xs text-white/40">
                                  <span className="tabular-nums">{viewer.percent_watched}% watched</span>
                                  <span className="tabular-nums">{formatDuration(viewer.seconds_watched)}</span>
                                  {viewer.completed && (
                                    <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                                      Finished
                                    </span>
                                  )}
                                  <span>{timeAgo(viewer.last_watched_at)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {section === "viewers" && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); loadAll() }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/25"
              />
            </div>
            <button type="submit" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20">
              Search
            </button>
            <p className="ml-2 text-xs text-white/35">Click a viewer for their full history.</p>
          </form>

          {viewers.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Users className="mx-auto mb-4 h-10 w-10 text-white/20" />
              <p className="text-white/40">No viewers in this window.</p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden rounded-2xl border-white/10">
              <div className="hidden gap-4 border-b border-white/[0.08] px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-white/35 lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
                <span>Viewer</span>
                <span className="text-right">Visits</span>
                <span className="text-right">Episodes</span>
                <span className="text-right">Came back for</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Last seen</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {viewers.map((row) => {
                  const key = row.profile_id || row.visitor_id || ""
                  return (
                    <div key={key}>
                      <button
                        onClick={() => showViewerHistory(row)}
                        className="grid w-full grid-cols-1 items-center gap-4 px-6 py-4 text-left transition hover:bg-white/[0.03] lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ChevronDown className={cn(
                            "h-4 w-4 shrink-0 text-white/30 transition",
                            openViewer === key && "rotate-180",
                          )} />
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15">
                            {row.avatar_url
                              ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                              : <Users className="h-4 w-4 text-primary" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{personName(row)}</p>
                            <p className="truncate text-xs text-white/35">
                              {row.email || "Not signed in"}
                              {row.last_series_title && ` · last: ${row.last_series_title} E${row.last_episode_number}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums">{row.sessions}</p>
                          <p className="text-[11px] text-white/30">{row.watch_days} watch days</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums">{row.episodes_watched}</p>
                          <p className="text-[11px] text-white/30">{row.episodes_completed} finished</p>
                        </div>
                        <div className="text-right">
                          {/* The returning-viewer number: episodes first watched
                              on a visit that was not their first. */}
                          <p className={cn(
                            "text-sm font-bold tabular-nums",
                            row.episodes_after_first_visit > 0 ? "text-emerald-400" : "text-white/30",
                          )}>
                            {row.episodes_after_first_visit > 0
                              ? `${row.episodes_after_first_visit} new`
                              : "—"}
                          </p>
                          <p className="text-[11px] text-white/30">
                            {row.episodes_after_first_visit > 0 ? "on a later visit" : "one visit only"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-primary">{row.paid_episodes}</p>
                          <p className="text-[11px] text-white/30">
                            {row.credits_spent} cr
                            {row.season_passes > 0 && ` · ${row.season_passes} pass`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-white/45">{timeAgo(row.last_seen_at)}</p>
                          <p className="text-[11px] text-white/25">
                            since {new Date(row.first_seen_at).toLocaleDateString()}
                          </p>
                        </div>
                      </button>

                      {openViewer === key && (
                        <div className="border-t border-white/[0.06] bg-black/25 px-6 py-4">
                          {loadingHistory ? (
                            <p className="flex items-center gap-2 text-sm text-white/40">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
                            </p>
                          ) : viewerHistory.length === 0 ? (
                            <p className="text-sm text-white/35">Nothing recorded for this viewer yet.</p>
                          ) : (
                            <ol className="space-y-2">
                              {viewerHistory.map((entry, index) => (
                                <li
                                  key={`${entry.session_id}-${entry.kind}-${index}`}
                                  className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-2.5 text-sm"
                                >
                                  <span className={cn(
                                    "rounded px-2 py-0.5 text-[10px] font-bold",
                                    entry.kind === "watch"
                                      ? "bg-blue-400/15 text-blue-300"
                                      : "bg-white/10 text-white/50",
                                  )}>
                                    {entry.kind === "watch" ? "Watched" : "Visited"}
                                  </span>
                                  {entry.kind === "watch" ? (
                                    <>
                                      <span className="font-medium">
                                        {entry.series_title} · E{entry.episode_number}
                                      </span>
                                      <span className="text-xs text-white/40">
                                        {entry.percent_watched === null ? "—" : `${entry.percent_watched}%`}
                                        {" · "}{formatDuration(entry.seconds_watched)}
                                      </span>
                                      <span className={cn(
                                        "rounded px-2 py-0.5 text-[10px] font-bold",
                                        entry.access === "free"
                                          ? "bg-white/10 text-white/50"
                                          : "bg-primary/15 text-primary",
                                      )}>
                                        {entry.access}
                                      </span>
                                      {entry.completed && (
                                        <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                                          Finished
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-white/45">
                                      {entry.path || "/"} · {entry.device || "unknown"}
                                    </span>
                                  )}
                                  <span className="ml-auto text-xs text-white/30">
                                    {new Date(entry.happened_at).toLocaleString()}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {section === "payments" && (
        <div className="glass-card overflow-hidden rounded-2xl border-white/10">
          <div className="border-b border-white/[0.08] px-6 py-4">
            <h2 className="text-sm font-bold">Every purchase in the last {days} days</h2>
            <p className="mt-0.5 text-xs text-white/35">
              Episode rentals and season passes, newest first.
            </p>
          </div>
          {purchases.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-white/35">Nothing has been bought in this window.</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {purchases.map((row, index) => (
                <div key={`${row.kind}-${row.profile_id}-${row.purchased_at}-${index}`} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-primary/15">
                    {row.avatar_url
                      ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <Users className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {row.full_name || row.email || "Unknown viewer"}
                    </p>
                    <p className="truncate text-xs text-white/35">{row.email}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {row.kind === "season_pass"
                        ? `${row.series_title} · Season pass`
                        : `${row.series_title} · Episode ${row.episode_number}`}
                    </p>
                    <p className="text-xs text-white/35">
                      {row.expires_at
                        ? `Access until ${new Date(row.expires_at).toLocaleDateString()}`
                        : "Permanent (legacy)"}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    {row.kind === "season_pass"
                      ? <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">₹{row.price_inr}</span>
                      : <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">{row.credits_spent} credits</span>}
                    {row.kind === "episode" && (
                      row.watched
                        ? <span className="text-xs text-white/40 tabular-nums">{row.percent_watched ?? 0}% watched</span>
                        // Paid and never opened is its own signal: a refund
                        // conversation, and invisible in a revenue total.
                        : <span className="rounded-lg bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-400">Never watched</span>
                    )}
                    <span className="text-xs text-white/30">{timeAgo(row.purchased_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
