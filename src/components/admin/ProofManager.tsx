"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, ImagePlus, Loader2, Pencil, Plus, ShieldAlert, Star, Trash2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  MAX_PROOF_SCREENSHOTS,
  defaultProofPageSettings,
  proofCategories,
  proofCategoryLabel,
  proofCurrencies,
  proofPoster,
  proofTypes,
  publishBlocker,
  toProofItem,
  toProofPageSettings,
  toProofPageSettingsRow,
  toProofRow,
  type ProofItem,
  type ProofPageSettings,
  type ProofType,
} from "@/lib/proof"
import { compressImage, posterFromVideo, uploadProofBlob, uploadScreenshot } from "@/lib/proof-media"
import { isEmbeddedVideo, youtubeFallbackThumbnailUrl } from "@/lib/video-embed"
import { cn } from "@/lib/utils"

/**
 * Proof manager: every piece of evidence the homepage shows, in one list.
 *
 * Three things are deliberately hard to do here, because each is a mistake
 * that is expensive once it is public:
 *
 *   Publishing without consent. The switch refuses and says why; the database
 *   refuses as well, so this form is not the only thing standing in the way.
 *
 *   Publishing a video with no poster. That is the black rectangle the old
 *   showcase grid was made of.
 *
 *   Deleting by accident. Delete asks first and then only hides the row.
 */

type Draft = Omit<ProofItem, "createdAt" | "updatedAt">

const blankDraft = (type: ProofType, sortOrder: number): Draft => ({
  id: "",
  type,
  title: "",
  category: "other",
  personName: "",
  personRole: "",
  avatarImage: "",
  quote: "",
  screenshots: [],
  video: "",
  posterImage: "",
  amount: null,
  currency: "INR",
  date: null,
  consentConfirmed: false,
  featured: false,
  published: false,
  sortOrder,
})

/** The list with `id` moved to sit where `beforeId` is. */
export function moveBefore<T extends { id: string }>(list: T[], id: string, beforeId: string): T[] {
  if (id === beforeId) return list
  const moving = list.find((entry) => entry.id === id)
  if (!moving) return list
  const target = list.findIndex((entry) => entry.id === beforeId)
  if (target < 0) return list
  const rest = list.filter((entry) => entry.id !== id)
  // The target's own index, counted before the row was lifted out: dragged
  // down, that lands just after the target; dragged up, just before it — in
  // both cases where the row visibly is when it is dropped.
  rest.splice(target, 0, moving)
  return rest
}

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/60"
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50"

export default function ProofManager() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProofItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ProofType | "all">("all")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  // Bumped to read the list again after a save.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    supabase
      .from("showcase_items")
      .select("*")
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage({ tone: "error", text: error.message })
        else setItems((data || []).map(toProofItem))
        setLoading(false)
      })
    return () => { active = false }
  }, [supabase, revision])

  const visible = filter === "all" ? items : items.filter((item) => item.type === filter)

  const patch = async (item: ProofItem, change: Partial<Pick<ProofItem, "published" | "featured">>) => {
    const next = { ...item, ...change }
    if (change.published) {
      const blocker = publishBlocker(next)
      if (blocker) { setMessage({ tone: "error", text: `"${item.title || "Untitled"}" — ${blocker}` }); return }
    }
    setItems((current) => current.map((entry) => (entry.id === item.id ? next : entry)))
    const { error } = await supabase
      .from("showcase_items")
      .update({ published: next.published, is_featured: next.featured })
      .eq("id", item.id)
    if (error) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)))
      setMessage({ tone: "error", text: error.message })
    } else setMessage(null)
  }

  const saveOrder = async (ordered: ProofItem[]) => {
    const previous = items
    setItems(ordered.map((item, position) => ({ ...item, sortOrder: position })))
    const { error } = await supabase.rpc("admin_reorder_proof_items", { p_ids: ordered.map((item) => item.id) })
    if (error) { setItems(previous); setMessage({ tone: "error", text: error.message }) }
  }

  const nudge = (item: ProofItem, direction: -1 | 1) => {
    const neighbour = visible[visible.indexOf(item) + direction]
    if (!neighbour) return
    const from = items.indexOf(item)
    const to = items.indexOf(neighbour)
    const ordered = [...items]
    ordered.splice(from, 1)
    ordered.splice(to, 0, item)
    void saveOrder(ordered)
  }

  const remove = async (item: ProofItem) => {
    if (!confirm(`Remove "${item.title || item.personName || "this item"}"? It will be unpublished and hidden from this list. Its files are kept.`)) return
    const { error } = await supabase
      .from("showcase_items")
      .update({ published: false, is_featured: false, deleted_at: new Date().toISOString() })
      .eq("id", item.id)
    if (error) { setMessage({ tone: "error", text: error.message }); return }
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    setMessage({ tone: "ok", text: "Removed." })
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-8 sm:pt-32">
      <Link href="/admin" className="inline-flex min-h-10 items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Proof manager</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">Portfolio work, student reviews and client sales. The homepage shows only what is published here; a section with nothing published is hidden.</p>
        </div>
        <button type="button" onClick={() => setDraft(blankDraft(filter === "all" ? "portfolio" : filter, items.length))} className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black hover:brightness-110"><Plus className="h-4 w-4" /> Add proof</button>
      </div>

      {message && <p role="status" className={cn("mt-5 rounded-lg border px-4 py-3 text-sm", message.tone === "error" ? "border-red-400/30 bg-red-400/5 text-red-200" : "border-primary/30 bg-primary/5 text-primary")}>{message.text}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {[{ key: "all" as const, label: "All" }, ...proofTypes].map((type) => (
          <button key={type.key} type="button" onClick={() => setFilter(type.key)} className={cn("min-h-9 rounded-full border px-4 text-sm font-medium transition", filter === type.key ? "border-primary bg-primary text-black" : "border-white/15 text-white/65 hover:text-white")}>
            {type.label} <span className="opacity-60">{type.key === "all" ? items.length : items.filter((item) => item.type === type.key).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-white/10 p-8 text-center text-sm text-white/50">Nothing here yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {visible.map((item, position) => {
            const thumb = proofPoster(item) || item.avatarImage
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(event) => { setDragging(item.id); event.dataTransfer.effectAllowed = "move" }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => { if (dragging && dragging !== item.id) event.preventDefault() }}
                onDrop={(event) => { event.preventDefault(); if (dragging) void saveOrder(moveBefore(items, dragging, item.id)); setDragging(null) }}
                className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-3 sm:flex-nowrap", dragging === item.id && "opacity-40")}
              >
                <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-white/30 sm:block" aria-hidden />
                {thumb
                  ? <img src={thumb} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white/5 text-xs text-white/35">None</span>}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold">{item.title || item.personName || "Untitled"}</p>
                  <p className="mt-0.5 truncate text-xs text-white/45">{proofTypes.find((type) => type.key === item.type)?.label} · {proofCategoryLabel(item.category)}{item.consentConfirmed ? "" : " · consent not confirmed"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Toggle on={item.published} onClick={() => void patch(item, { published: !item.published })} labelOn="Published" labelOff="Draft" />
                  <button type="button" onClick={() => void patch(item, { featured: !item.featured })} aria-pressed={item.featured} title={item.featured ? "Featured: in the hero reel and proof strip" : "Not featured"} className={cn("grid h-9 w-9 place-items-center rounded-md border transition", item.featured ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-white/35 hover:text-white")}><Star className={cn("h-4 w-4", item.featured && "fill-current")} /></button>
                  <button type="button" onClick={() => nudge(item, -1)} disabled={position === 0} aria-label="Move up" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white/50 hover:text-white disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => nudge(item, 1)} disabled={position === visible.length - 1} aria-label="Move down" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white/50 hover:text-white disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setDraft({ ...item })} aria-label="Edit" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white/60 hover:text-white"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void remove(item)} aria-label="Remove" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white/60 hover:border-red-400/40 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <PageSettings onMessage={setMessage} />

      {draft && (
        <ProofForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(text) => { setDraft(null); setMessage({ tone: "ok", text }); setRevision((current) => current + 1) }}
        />
      )}
    </section>
  )
}

function Toggle({ on, onClick, labelOn, labelOff }: { on: boolean; onClick: () => void; labelOn: string; labelOff: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cn("h-9 rounded-md border px-3 text-xs font-semibold transition", on ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-white/45 hover:text-white")}>
      {on ? labelOn : labelOff}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Create / edit                                                               */
/* -------------------------------------------------------------------------- */

function ProofForm({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (message: string) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [dropping, setDropping] = useState(false)
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))
  const blocker = publishBlocker(draft)

  const run = async (status: string, work: () => Promise<void>) => {
    setBusy(status)
    setError("")
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong.") }
    setBusy("")
  }

  const addScreenshots = (files: File[]) => run("Compressing and uploading screenshots…", async () => {
    const room = MAX_PROOF_SCREENSHOTS - draft.screenshots.length
    const images = files.filter((file) => file.type.startsWith("image/")).slice(0, room)
    if (!images.length) throw new Error(room <= 0 ? `At most ${MAX_PROOF_SCREENSHOTS} screenshots.` : "Choose image files.")
    const uploaded = await Promise.all(images.map((file) => uploadScreenshot(supabase, file)))
    setDraft((current) => ({ ...current, screenshots: [...current.screenshots, ...uploaded].slice(0, MAX_PROOF_SCREENSHOTS) }))
  })

  const uploadImage = (file: File, folder: string, maxSide: number, key: "avatarImage" | "posterImage") => run("Uploading image…", async () => {
    set({ [key]: await uploadProofBlob(supabase, await compressImage(file, maxSide), folder, "webp") })
  })

  const uploadVideo = (file: File) => run(`Uploading video (${(file.size / 1024 / 1024).toFixed(1)} MB)…`, async () => {
    const extension = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"
    const url = await uploadProofBlob(supabase, file, "videos", extension)
    // A poster is required with a video, so one is made from the file while it
    // is still in hand, unless the admin has already chosen their own.
    let poster = draft.posterImage
    if (!poster) {
      try { poster = await uploadProofBlob(supabase, await posterFromVideo(file), "posters", "webp") } catch { /* they can upload one */ }
    }
    set({ video: url, posterImage: poster })
  })

  const generatePoster = () => run("Reading a frame from the video…", async () => {
    set({ posterImage: await uploadProofBlob(supabase, await posterFromVideo(draft.video), "posters", "webp") })
  })

  const save = () => run("Saving…", async () => {
    if (!draft.title.trim() && !draft.personName.trim()) throw new Error("Give it a title or a name.")
    if (draft.video.trim() && !draft.posterImage) throw new Error("A video needs a poster image. Upload one, or generate it from the video.")
    if (draft.published && blocker) throw new Error(blocker)
    const row = toProofRow(draft)
    const result = draft.id
      ? await supabase.from("showcase_items").update(row).eq("id", draft.id)
      : await supabase.from("showcase_items").insert({ ...row, description: "" })
    if (result.error) throw new Error(result.error.message)
    onSaved(draft.published ? "Saved and published." : "Saved as a draft.")
  })

  const youtubePoster = youtubeFallbackThumbnailUrl(draft.video)

  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit proof" : "Add proof"} className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0d0f0e] p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{draft.id ? "Edit proof" : "Add proof"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="proof-type">Type</label>
            <select id="proof-type" value={draft.type} onChange={(event) => set({ type: event.target.value as ProofType })} className={field}>
              {proofTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="proof-category">Category</label>
            <select id="proof-category" value={draft.category} onChange={(event) => set({ category: event.target.value })} className={field}>
              {proofCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
              {/* A row saved under an older showcase category keeps it until changed. */}
              {!proofCategories.some((category) => category.key === draft.category) && <option value={draft.category}>{proofCategoryLabel(draft.category)} ({draft.category})</option>}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="proof-title">Title</label>
            <input id="proof-title" value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder="e.g. Skincare UGC ad" className={field} />
            <p className="mt-1.5 text-xs text-white/40">No third-party brand names unless they were a real client — &ldquo;beauty brand ad&rdquo;, not the brand.</p>
          </div>
          <div>
            <label className={label} htmlFor="proof-name">Person name <span className="font-normal normal-case text-white/35">(optional)</span></label>
            <input id="proof-name" value={draft.personName} onChange={(event) => set({ personName: event.target.value })} placeholder="As they agreed to be shown" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="proof-role">Role / city <span className="font-normal normal-case text-white/35">(optional)</span></label>
            <input id="proof-role" value={draft.personRole} onChange={(event) => set({ personRole: event.target.value })} placeholder="e.g. Freelance editor, Pune" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="proof-quote">Quote <span className="font-normal normal-case text-white/35">(optional)</span></label>
            <textarea id="proof-quote" value={draft.quote} onChange={(event) => set({ quote: event.target.value })} rows={3} placeholder="Their words, as written." className={field} />
          </div>

          <div>
            <span className={label}>Avatar <span className="font-normal normal-case text-white/35">(optional)</span></span>
            <ImageSlot url={draft.avatarImage} round onPick={(file) => uploadImage(file, "avatars", 320, "avatarImage")} onClear={() => set({ avatarImage: "" })} />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className={label} htmlFor="proof-amount">Amount <span className="font-normal normal-case text-white/35">(optional)</span></label>
              <input id="proof-amount" type="number" min="0" value={draft.amount ?? ""} onChange={(event) => set({ amount: event.target.value === "" ? null : Number(event.target.value) })} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="proof-currency">Currency</label>
              <select id="proof-currency" value={draft.currency || "INR"} onChange={(event) => set({ currency: event.target.value as Draft["currency"] })} className={field}>
                {proofCurrencies.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={label} htmlFor="proof-date">Date <span className="font-normal normal-case text-white/35">(optional)</span></label>
              <input id="proof-date" type="date" value={draft.date || ""} onChange={(event) => set({ date: event.target.value || null })} className={field} />
            </div>
          </div>
        </div>

        {/* Screenshots */}
        <div className="mt-6">
          <span className={label}>Screenshots <span className="font-normal normal-case text-white/35">({draft.screenshots.length}/{MAX_PROOF_SCREENSHOTS}) — payment proof, chat, invoice, review</span></span>
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Blur phone numbers, emails, bank and payment details before uploading.</p>
          <div
            onDragOver={(event) => { event.preventDefault(); setDropping(true) }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event) => { event.preventDefault(); setDropping(false); void addScreenshots(Array.from(event.dataTransfer.files)) }}
            className={cn("rounded-xl border border-dashed p-3 transition", dropping ? "border-primary bg-primary/5" : "border-white/15")}
          >
            <div className="flex flex-wrap gap-2">
              {draft.screenshots.map((shot) => (
                <div key={shot.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10">
                  <img src={shot.thumb} alt="" className="h-full w-full object-cover" />
                  <button type="button" aria-label="Remove screenshot" onClick={() => set({ screenshots: draft.screenshots.filter((entry) => entry.url !== shot.url) })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/75 hover:bg-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {draft.screenshots.length < MAX_PROOF_SCREENSHOTS && (
                <label className="grid h-20 min-w-20 flex-1 cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/[.03] px-3 text-center text-xs text-white/50 hover:text-white">
                  <span className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Drop images here or choose</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addScreenshots(Array.from(event.target.files || [])); event.target.value = "" }} />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Video + poster */}
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className={label} htmlFor="proof-video">Video <span className="font-normal normal-case text-white/35">(optional) — YouTube, Instagram or Vimeo link, or upload a file</span></label>
            <input id="proof-video" value={draft.video} onChange={(event) => set({ video: event.target.value })} placeholder="https://…" className={field} />
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white">
                Upload video file
                <input type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadVideo(file); event.target.value = "" }} />
              </label>
              {draft.video && !isEmbeddedVideo(draft.video) && <button type="button" onClick={() => void generatePoster()} className="h-9 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white">Generate poster from video</button>}
              {youtubePoster && <button type="button" onClick={() => set({ posterImage: youtubePoster })} className="h-9 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white">Use YouTube thumbnail</button>}
            </div>
          </div>
          <div>
            <span className={label}>Poster{draft.video ? " (required)" : ""}</span>
            <ImageSlot url={draft.posterImage} onPick={(file) => uploadImage(file, "posters", 1280, "posterImage")} onClear={() => set({ posterImage: "" })} />
          </div>
        </div>

        {/* Consent + state */}
        <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={draft.consentConfirmed} onChange={(event) => set({ consentConfirmed: event.target.checked, published: event.target.checked ? draft.published : false })} className="mt-1 h-4 w-4 accent-[hsl(74_89%_56%)]" />
            <span><span className="block text-sm font-semibold">Consent confirmed</span><span className="block text-xs text-white/50">Confirm this person agreed to be shown publicly. Required to publish.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={draft.featured} onChange={(event) => set({ featured: event.target.checked })} className="mt-1 h-4 w-4 accent-[hsl(74_89%_56%)]" />
            <span><span className="block text-sm font-semibold">Featured</span><span className="block text-xs text-white/50">Shown in the hero reel (portfolio videos) and the proof strip under it.</span></span>
          </label>
          <label className={cn("flex items-start gap-3", blocker ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <input type="checkbox" checked={draft.published} disabled={Boolean(blocker)} onChange={(event) => set({ published: event.target.checked })} className="mt-1 h-4 w-4 accent-[hsl(74_89%_56%)]" />
            <span><span className="block text-sm font-semibold">Published</span><span className="block text-xs text-white/50">{blocker || "Visible on the homepage. Unticked, this stays a draft."}</span></span>
          </label>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {busy && <span className="mr-auto inline-flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</span>}
          <button type="button" onClick={onClose} className="h-11 rounded-md border border-white/15 px-5 text-sm font-semibold hover:bg-white/10">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

function ImageSlot({ url, round, onPick, onClear }: { url: string; round?: boolean; onPick: (file: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      {url
        ? <img src={url} alt="" className={cn("h-20 w-20 border border-white/10 object-cover", round ? "rounded-full" : "rounded-lg")} />
        : <span className={cn("grid h-20 w-20 place-items-center border border-dashed border-white/15 text-white/30", round ? "rounded-full" : "rounded-lg")}><ImagePlus className="h-5 w-5" /></span>}
      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white">{url ? "Replace" : "Upload"}</button>
        {url && <button type="button" onClick={onClear} className="text-left text-xs text-white/45 hover:text-red-300">Remove</button>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPick(file); event.target.value = "" }} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page settings                                                               */
/* -------------------------------------------------------------------------- */

function PageSettings({ onMessage }: { onMessage: (message: { tone: "ok" | "error"; text: string }) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<ProofPageSettings>(defaultProofPageSettings)
  const [busy, setBusy] = useState("")
  const set = (change: Partial<ProofPageSettings>) => setSettings((current) => ({ ...current, ...change }))

  useEffect(() => {
    let active = true
    supabase.from("site_settings").select("value").eq("key", "proof_page").maybeSingle().then(({ data }) => {
      if (active && data?.value) setSettings(toProofPageSettings(data.value))
    })
    return () => { active = false }
  }, [supabase])

  const save = async () => {
    setBusy("Saving…")
    const { data, error } = await supabase.rpc("admin_set_proof_page_settings", { p_value: toProofPageSettingsRow(settings) })
    setBusy("")
    if (error) { onMessage({ tone: "error", text: error.message }); return }
    setSettings(toProofPageSettings(data))
    onMessage({ tone: "ok", text: "Page settings saved." })
  }

  const uploadDemo = async (file: File) => {
    setBusy("Uploading…")
    try {
      if (file.type.startsWith("video/")) {
        const extension = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"
        const url = await uploadProofBlob(supabase, file, "studio-demo", extension)
        let poster = ""
        try { poster = await uploadProofBlob(supabase, await posterFromVideo(file), "studio-demo", "webp") } catch { /* optional */ }
        set({ studioDemoUrl: url, studioDemoPoster: poster })
      } else {
        set({ studioDemoUrl: await uploadProofBlob(supabase, await compressImage(file, 1920, 0.85), "studio-demo", "webp"), studioDemoPoster: "" })
      }
    } catch (caught) {
      onMessage({ tone: "error", text: caught instanceof Error ? caught.message : "Upload failed." })
    }
    setBusy("")
  }

  return (
    <section className="mt-14 rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Page settings</h2>
      <p className="mt-1.5 text-sm text-white/50">Anything left empty is hidden on the homepage rather than shown blank.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="settings-cost">Cost example</label>
          <input id="settings-cost" value={settings.costExample} onChange={(event) => set({ costExample: event.target.value })} placeholder="A real figure from your own provider bill." className={field} />
          <p className="mt-1.5 text-xs text-white/40">Shown under reason 5 and in the FAQ. Use a number you can back up.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="settings-guide">API key setup guide link</label>
          <input id="settings-guide" value={settings.apiGuideUrl} onChange={(event) => set({ apiGuideUrl: event.target.value })} placeholder="https://… or /blog/…" className={field} />
        </div>
        <div className="sm:col-span-2">
          <span className={label}>Creator Studio screenshot or screen recording</span>
          <div className="flex flex-wrap items-center gap-3">
            {settings.studioDemoUrl && <span className="max-w-full truncate rounded-md bg-black/40 px-3 py-2 text-xs text-white/60">{settings.studioDemoUrl.split("/").pop()}</span>}
            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white">
              {settings.studioDemoUrl ? "Replace" : "Upload image or video"}
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDemo(file); event.target.value = "" }} />
            </label>
            {settings.studioDemoUrl && <button type="button" onClick={() => set({ studioDemoUrl: "", studioDemoPoster: "" })} className="text-xs text-white/45 hover:text-red-300">Remove</button>}
          </div>
          <p className="mt-1.5 text-xs text-white/40">Shown beside the AI Director Agent block.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={settings.showCommunityReason} onChange={(event) => set({ showCommunityReason: event.target.checked })} className="mt-1 h-4 w-4 accent-[hsl(74_89%_56%)]" />
          <span><span className="block text-sm font-semibold">Show community reason</span><span className="block text-xs text-white/50">Adds reason 8, &ldquo;Learn with other AI directors&rdquo;. Off shows 7 reasons.</span></span>
        </label>
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={settings.showAnnualPlan} onChange={(event) => set({ showAnnualPlan: event.target.checked })} className="mt-1 h-4 w-4 accent-[hsl(74_89%_56%)]" />
            <span><span className="block text-sm font-semibold">Show annual plan</span><span className="block text-xs text-white/50">Adds an annual card to the pricing block. Needs a price.</span></span>
          </label>
          <input type="number" min="0" aria-label="Annual price in rupees" value={settings.annualPrice ?? ""} onChange={(event) => set({ annualPrice: event.target.value === "" ? null : Number(event.target.value) })} placeholder="Annual price (₹)" className={cn(field, "mt-3")} />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        {busy && <span className="inline-flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</span>}
        <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50">Save settings</button>
      </div>
    </section>
  )
}
