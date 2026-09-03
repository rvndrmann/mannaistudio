"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { DEFAULT_EPISODE_PRICE, DEFAULT_FREE_EPISODES } from "@/lib/originals"

type SeriesRow = {
  id: string
  slug: string
  title: string
  description: string | null
  poster_url: string | null
  banner_url: string | null
  genre: string | null
  tags: string[] | null
  free_episodes: number
  episode_price: number
  is_published: boolean
  sort_order: number
}

type EpisodeRow = {
  id: string
  series_id: string
  episode_number: number
  title: string
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  is_published: boolean
}

const blankSeries = (): SeriesRow => ({
  id: "",
  slug: "",
  title: "",
  description: "",
  poster_url: "",
  banner_url: "",
  genre: "",
  tags: [],
  free_episodes: DEFAULT_FREE_EPISODES,
  episode_price: DEFAULT_EPISODE_PRICE,
  is_published: false,
  sort_order: 0,
})

const MAX_POSTER_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 500 * 1024 * 1024

/** "She Came Back" -> "she-came-back". */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Originals content management.
 *
 * Reads go straight to the tables (admins have a SELECT policy); every write
 * goes through the `admin_upsert_*` / `admin_delete_*` functions, which check
 * `admin_users` inside. Same split as the course and challenge managers.
 */
export default function OriginalsManager() {
  const supabase = createClient()

  const [series, setSeries] = useState<SeriesRow[]>([])
  const [episodes, setEpisodes] = useState<Record<string, EpisodeRow[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState<SeriesRow | null>(null)
  // Whether the slug is the admin's own text rather than something derived from
  // the title. Set when they type in the field, and set for every existing
  // series — a saved slug is a live URL, and retyping the title should not
  // silently move the page out from under any link pointing at it.
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ tone: "ok" | "error"; message: string } | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("originals_series")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
    if (error) setStatus({ tone: "error", message: error.message })
    else setSeries((data as SeriesRow[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const loadEpisodes = async (seriesId: string) => {
    const { data, error } = await supabase
      .from("originals_episodes")
      .select("*")
      .eq("series_id", seriesId)
      .order("episode_number", { ascending: true })
    if (error) setStatus({ tone: "error", message: error.message })
    else setEpisodes((current) => ({ ...current, [seriesId]: (data as EpisodeRow[]) || [] }))
  }

  const toggleSeries = async (seriesId: string) => {
    if (expanded === seriesId) {
      setExpanded(null)
      return
    }
    setExpanded(seriesId)
    if (!episodes[seriesId]) await loadEpisodes(seriesId)
  }

  const uploadFile = async (file: File, bucket: string, folder: string) => {
    const extension = file.name.split(".").pop()
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
    if (error) throw new Error(error.message)
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  const saveSeries = async () => {
    if (!draft) return
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase.rpc("admin_upsert_originals_series", {
        p_id: draft.id || null,
        p_slug: draft.slug,
        p_title: draft.title,
        p_description: draft.description || null,
        p_poster_url: draft.poster_url || null,
        p_banner_url: draft.banner_url || null,
        p_genre: draft.genre || null,
        p_tags: draft.tags || [],
        p_free_episodes: draft.free_episodes,
        p_episode_price: draft.episode_price,
        p_is_published: draft.is_published,
        p_sort_order: draft.sort_order,
      })
      if (error) throw new Error(error.message)
      setStatus({ tone: "ok", message: `Saved "${draft.title}"` })
      setDraft(null)
      await load()
    } catch (err) {
      setStatus({ tone: "error", message: err instanceof Error ? err.message : "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  const deleteSeries = async (row: SeriesRow) => {
    if (!confirm(`Delete "${row.title}" and all of its episodes? This cannot be undone.`)) return
    const { error } = await supabase.rpc("admin_delete_originals_series", { p_id: row.id })
    if (error) setStatus({ tone: "error", message: error.message })
    else {
      setStatus({ tone: "ok", message: `Deleted "${row.title}"` })
      await load()
    }
  }

  const saveEpisode = async (episode: EpisodeRow) => {
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase.rpc("admin_upsert_originals_episode", {
        p_id: episode.id || null,
        p_series_id: episode.series_id,
        p_episode_number: episode.episode_number,
        p_title: episode.title,
        p_description: episode.description || null,
        p_video_url: episode.video_url || null,
        p_thumbnail_url: episode.thumbnail_url || null,
        p_duration_seconds: episode.duration_seconds,
        p_is_published: episode.is_published,
      })
      if (error) throw new Error(error.message)
      setStatus({ tone: "ok", message: `Saved episode ${episode.episode_number}` })
      await loadEpisodes(episode.series_id)
    } catch (err) {
      setStatus({ tone: "error", message: err instanceof Error ? err.message : "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  const deleteEpisode = async (episode: EpisodeRow) => {
    if (!confirm(`Delete episode ${episode.episode_number}?`)) return
    const { error } = await supabase.rpc("admin_delete_originals_episode", { p_id: episode.id })
    if (error) setStatus({ tone: "error", message: error.message })
    else await loadEpisodes(episode.series_id)
  }

  const patchEpisode = (seriesId: string, index: number, patch: Partial<EpisodeRow>) => {
    setEpisodes((current) => ({
      ...current,
      [seriesId]: (current[seriesId] || []).map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const addEpisodeRow = (seriesId: string) => {
    const existing = episodes[seriesId] || []
    const nextNumber = existing.reduce((max, row) => Math.max(max, row.episode_number), 0) + 1
    setEpisodes((current) => ({
      ...current,
      [seriesId]: [
        ...existing,
        {
          id: "",
          series_id: seriesId,
          episode_number: nextNumber,
          title: `Episode ${nextNumber}`,
          description: "",
          video_url: "",
          thumbnail_url: "",
          duration_seconds: null,
          is_published: true,
        },
      ],
    }))
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Originals</h2>
          <p className="mt-1 text-sm text-white/40">
            Series and episodes for /originals. First {DEFAULT_FREE_EPISODES} episodes free by default, then{" "}
            {DEFAULT_EPISODE_PRICE} credits each — both adjustable per series.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSlugEdited(false)
            setDraft(blankSeries())
          }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New series
        </button>
      </div>

      {status && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
            status.tone === "ok"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {status.tone === "ok" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}

      {/* Series editor */}
      {draft && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{draft.id ? "Edit series" : "New series"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Title</span>
              <input
                className={inputClass}
                value={draft.title}
                onChange={(e) => {
                  const title = e.target.value
                  setDraft({ ...draft, title, ...(slugEdited ? {} : { slug: slugify(title) }) })
                }}
                placeholder="Midnight Circuit"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Slug (URL)</span>
              <input
                className={inputClass}
                value={draft.slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
                }}
                placeholder="midnight-circuit"
              />
              <span className="mt-1.5 block text-[11px] text-white/35">
                Filled in from the title. Edit it to set your own.
              </span>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Description</span>
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={draft.description || ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Genre</span>
              <input
                className={inputClass}
                value={draft.genre || ""}
                onChange={(e) => setDraft({ ...draft, genre: e.target.value })}
                placeholder="Thriller"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Sort order</span>
              <input
                type="number"
                className={inputClass}
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value) || 0 })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Free episodes</span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={draft.free_episodes}
                onChange={(e) => setDraft({ ...draft, free_episodes: Math.max(0, parseInt(e.target.value) || 0) })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Credits per episode</span>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={draft.episode_price}
                onChange={(e) => setDraft({ ...draft, episode_price: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </label>

            <div className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-white/50">Poster (9:16, max 5 MB)</span>
              <div className="flex flex-wrap items-center gap-3">
                {draft.poster_url && (
                  <img src={draft.poster_url} alt="" className="h-24 w-14 rounded-lg border border-white/10 object-cover" />
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10">
                  {uploading === "poster" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload poster
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > MAX_POSTER_BYTES) {
                        setStatus({ tone: "error", message: "Posters must be 5 MB or smaller." })
                        return
                      }
                      setUploading("poster")
                      try {
                        const url = await uploadFile(file, "thumbnails", "originals/posters")
                        setDraft((current) => (current ? { ...current, poster_url: url } : current))
                      } catch (err) {
                        setStatus({ tone: "error", message: err instanceof Error ? err.message : "Upload failed" })
                      } finally {
                        setUploading(null)
                      }
                    }}
                  />
                </label>
                <input
                  className={`${inputClass} flex-1`}
                  value={draft.poster_url || ""}
                  onChange={(e) => setDraft({ ...draft, poster_url: e.target.value })}
                  placeholder="…or paste a poster URL"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={draft.is_published}
                onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                className="h-4 w-4 accent-[#b9f42e]"
              />
              <span className="text-sm text-white/70">Published — visible on /originals</span>
            </label>
          </div>

          {(!draft.title.trim() || !draft.slug.trim()) && (
            <p className="mt-6 flex items-center gap-2 text-xs font-medium text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {!draft.title.trim() ? "Add a title to save this series." : "Add a slug to save this series."}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={saveSeries}
              disabled={saving || !draft.title.trim() || !draft.slug.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save series
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Series list */}
      {loading ? (
        <div className="flex items-center gap-3 py-12 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading series…</span>
        </div>
      ) : series.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center text-sm text-white/40">
          No series yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {series.map((row) => (
            <div key={row.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center gap-4 p-4">
                <button
                  type="button"
                  onClick={() => toggleSeries(row.id)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  {expanded === row.id ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                  )}
                  {row.poster_url ? (
                    <img src={row.poster_url} alt="" className="h-14 w-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-14 w-9 shrink-0 rounded-md bg-white/5" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{row.title}</p>
                    <p className="text-xs text-white/40">
                      /{row.slug} · {row.free_episodes} free · {row.episode_price} credits each
                    </p>
                  </div>
                </button>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold ${
                    row.is_published ? "bg-primary/15 text-primary" : "bg-white/10 text-white/50"
                  }`}
                >
                  {row.is_published ? "Live" : "Draft"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSlugEdited(true)
                    setDraft(row)
                  }}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteSeries(row)}
                  aria-label={`Delete ${row.title}`}
                  className="shrink-0 rounded-lg p-2 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {expanded === row.id && (
                <div className="border-t border-white/[0.06] bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Episodes</h4>
                    <button
                      type="button"
                      onClick={() => addEpisodeRow(row.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add episode
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(episodes[row.id] || []).map((episode, index) => {
                      const free = episode.episode_number <= row.free_episodes
                      return (
                        <div key={episode.id || `new-${index}`} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                          <div className="grid gap-3 md:grid-cols-[80px_1fr_140px]">
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-semibold text-white/50">No.</span>
                              <input
                                type="number"
                                min={1}
                                className={inputClass}
                                value={episode.episode_number}
                                onChange={(e) =>
                                  patchEpisode(row.id, index, { episode_number: Math.max(1, parseInt(e.target.value) || 1) })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-semibold text-white/50">Title</span>
                              <input
                                className={inputClass}
                                value={episode.title}
                                onChange={(e) => patchEpisode(row.id, index, { title: e.target.value })}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-semibold text-white/50">Duration (s)</span>
                              <input
                                type="number"
                                min={0}
                                className={inputClass}
                                value={episode.duration_seconds ?? ""}
                                onChange={(e) =>
                                  patchEpisode(row.id, index, {
                                    duration_seconds: e.target.value ? parseInt(e.target.value) : null,
                                  })
                                }
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10">
                              {uploading === `video-${index}-${row.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                              Upload video
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  if (file.size > MAX_VIDEO_BYTES) {
                                    setStatus({ tone: "error", message: "Videos must be 500 MB or smaller." })
                                    return
                                  }
                                  setUploading(`video-${index}-${row.id}`)
                                  try {
                                    const url = await uploadFile(file, "videos", "originals")
                                    patchEpisode(row.id, index, { video_url: url })
                                  } catch (err) {
                                    setStatus({ tone: "error", message: err instanceof Error ? err.message : "Upload failed" })
                                  } finally {
                                    setUploading(null)
                                  }
                                }}
                              />
                            </label>
                            <input
                              className={`${inputClass} flex-1`}
                              value={episode.video_url || ""}
                              onChange={(e) => patchEpisode(row.id, index, { video_url: e.target.value })}
                              placeholder="Video URL"
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                                  free ? "bg-primary/15 text-primary" : "bg-white/10 text-white/60"
                                }`}
                              >
                                {free ? "Free" : `${row.episode_price} credits`}
                              </span>
                              <label className="flex items-center gap-2 text-xs text-white/60">
                                <input
                                  type="checkbox"
                                  checked={episode.is_published}
                                  onChange={(e) => patchEpisode(row.id, index, { is_published: e.target.checked })}
                                  className="h-3.5 w-3.5 accent-[#b9f42e]"
                                />
                                Published
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEpisode(episode)}
                                disabled={saving || !episode.title}
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
                              >
                                <Save className="h-3.5 w-3.5" />
                                Save
                              </button>
                              {episode.id && (
                                <button
                                  type="button"
                                  onClick={() => deleteEpisode(episode)}
                                  aria-label={`Delete episode ${episode.episode_number}`}
                                  className="rounded-lg p-2 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {(episodes[row.id] || []).length === 0 && (
                      <p className="py-6 text-center text-xs text-white/30">No episodes yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
