"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check, Eye, EyeOff, Film, GripVertical, Image as ImageIcon, Loader2,
  Plus, Star, Trash2, Upload, X,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatUsdWithInr } from "@/lib/currency"
import { buildCatalogue, type OfferPackage, type OfferService } from "@/lib/managed-offers"
import { inspectVideoFile, videoUploadProblems } from "@/lib/video-upload-check"

/**
 * The Hire Us catalogue, editable.
 *
 * A service is a gig — the card that sells, with its own thumbnail and promo
 * video — and its packages are the price tiers underneath. Everything here is
 * written through `admin_upsert_*` functions that check `admin_users`
 * themselves, so this screen is a form and the database is the authority.
 *
 * Media goes to the public `thumbnails` and `videos` buckets rather than the
 * private studio bucket: /hire-us is open to strangers, and a signed URL that
 * expires is a card with a dead image on it.
 */

const THUMB_BUCKET = "thumbnails"
const VIDEO_BUCKET = "videos"
const THUMB_MAX_BYTES = 5 * 1024 * 1024

type Draft = Omit<OfferService, "packages"> & { packages: OfferPackage[] }

const BLANK_SERVICE: Draft = {
  id: "", key: "", name: "", tagline: "", description: "", cta: "Start Project",
  thumbnailUrl: "", videoUrl: "", deliverables: [], styles: [],
  quoteOnly: false, isPublished: false, position: 0, packages: [],
}

const BLANK_PACKAGE: OfferPackage = {
  id: "", key: "", name: "", summary: "", videoCount: 1, durationSeconds: 30,
  revisions: 2, priceInr: 0, includes: [], popular: false, isPublished: true, position: 0,
}

/** A key a human typed, in the shape the database will accept. */
function toKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 58)
}

export default function ManagedOffers() {
  const supabase = createClient()
  const [services, setServices] = useState<OfferService[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: rows, error: rowsError }, { data: packs, error: packsError }] = await Promise.all([
        supabase.from("managed_offer_services").select("*").order("position"),
        supabase.from("managed_offer_packages").select("*").order("position"),
      ])
      if (rowsError) throw rowsError
      if (packsError) throw packsError
      setServices(buildCatalogue(rows ?? [], packs ?? []))
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the catalogue.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  const open = services.find((service) => service.id === openId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Offers</h3>
          <p className="mt-0.5 text-sm text-white/40">
            What /hire-us sells. Each gig carries its own thumbnail, promo video and price tiers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreating(true); setOpenId(null) }}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-xs font-semibold text-black transition hover:brightness-110 active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" />
          New gig
        </button>
      </div>

      {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ul className="space-y-2">
            {services.map((service) => (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setOpenId(service.id === openId ? null : service.id) }}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    service.id === openId
                      ? "border-primary/50 bg-primary/[0.08]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
                    {service.thumbnailUrl ? (
                      <img src={service.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-white/20" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold">{service.name}</span>
                      {!service.isPublished && (
                        <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                          DRAFT
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/35">
                      {service.quoteOnly
                        ? "Quote only"
                        : service.packages.length
                          ? `${service.packages.length} tier(s) · from ${formatUsdWithInr(
                              Math.min(...service.packages.map((option) => option.priceInr)),
                            )}`
                          : "No tiers yet"}
                    </span>
                  </span>
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/15" />
                </button>
              </li>
            ))}
            {services.length === 0 && (
              <li className="rounded-xl border border-dashed border-white/12 p-6 text-center text-xs text-white/30">
                No gigs yet.
              </li>
            )}
          </ul>

          <div>
            {creating ? (
              <ServiceEditor key="new" draft={BLANK_SERVICE} onSaved={(id) => { setCreating(false); setOpenId(id); load() }} onCancel={() => setCreating(false)} onDeleted={load} />
            ) : open ? (
              <ServiceEditor key={open.id} draft={open} onSaved={load} onCancel={() => setOpenId(null)} onDeleted={() => { setOpenId(null); load() }} />
            ) : (
              <div className="grid h-full min-h-[220px] place-items-center rounded-2xl border border-dashed border-white/12 text-sm text-white/30">
                Pick a gig to edit it, or create one.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceEditor({
  draft, onSaved, onCancel, onDeleted,
}: {
  draft: Draft
  onSaved: (id: string) => void
  onCancel: () => void
  onDeleted: () => void
}) {
  const supabase = createClient()
  const isNew = !draft.id
  const [form, setForm] = useState<Draft>(draft)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setSaving(true)
    setMessage("")
    try {
      const { data, error } = await supabase.rpc("admin_upsert_managed_service", {
        p_id: isNew ? null : form.id,
        p_key: isNew ? toKey(form.key || form.name) : form.key,
        p_name: form.name,
        p_tagline: form.tagline,
        p_description: form.description,
        p_cta: form.cta,
        p_thumbnail_url: form.thumbnailUrl,
        p_video_url: form.videoUrl,
        p_deliverables: form.deliverables,
        p_styles: form.styles,
        p_quote_only: form.quoteOnly,
        p_is_published: form.isPublished,
        p_position: form.position || null,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      setMessage("Saved.")
      onSaved(row?.id ?? form.id)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${form.name}"? Orders already placed for it keep the name they were sold under.`)) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc("admin_delete_managed_service", { p_id: form.id })
      if (error) throw error
      onDeleted()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not delete.")
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold">{isNew ? "New gig" : form.name}</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set("isPublished", !form.isPublished)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold transition ${
              form.isPublished
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            }`}
          >
            {form.isPublished ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {form.isPublished ? "Published" : "Draft"}
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={remove}
              className="grid h-8 w-8 place-items-center rounded-md border border-white/12 text-white/40 transition hover:bg-red-500/15 hover:text-red-300"
              aria-label="Delete gig"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled label="Name">
          <Input value={form.name} onChange={(value) => set("name", value)} placeholder="UGC Ads" />
        </Labelled>
        <Labelled
          label="Key"
          hint={isNew ? "Auto-filled from the name. Cannot change later." : "Fixed — orders record it."}
        >
          <Input
            value={isNew ? (form.key || toKey(form.name)) : form.key}
            onChange={(value) => set("key", toKey(value))}
            disabled={!isNew}
            placeholder="ugc"
          />
        </Labelled>
        <Labelled label="Tagline">
          <Input value={form.tagline} onChange={(value) => set("tagline", value)} placeholder="Creator-style ads that look native to the feed" />
        </Labelled>
        <Labelled label="Button text">
          <Input value={form.cta} onChange={(value) => set("cta", value)} placeholder="Start UGC Project" />
        </Labelled>
      </div>

      <Labelled label="Description">
        <TextArea value={form.description} onChange={(value) => set("description", value)} />
      </Labelled>

      <div className="grid gap-4 sm:grid-cols-2">
        <MediaField
          label="Thumbnail"
          kind="image"
          bucket={THUMB_BUCKET}
          folder="hire-us"
          value={form.thumbnailUrl}
          onChange={(url) => set("thumbnailUrl", url)}
        />
        <MediaField
          label="Promo video"
          kind="video"
          bucket={VIDEO_BUCKET}
          folder="hire-us"
          value={form.videoUrl}
          onChange={(url) => set("videoUrl", url)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled label="Deliverables" hint="One per line. Shown as ticks on the card.">
          <TextArea
            value={form.deliverables.join("\n")}
            onChange={(value) => set("deliverables", value.split("\n").map((line) => line.trim()).filter(Boolean))}
          />
        </Labelled>
        <Labelled label="Creative direction options" hint="One per line. Offered as chips in the brief.">
          <TextArea
            value={form.styles.join("\n")}
            onChange={(value) => set("styles", value.split("\n").map((line) => line.trim()).filter(Boolean))}
          />
        </Labelled>
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 p-3">
        <input
          type="checkbox"
          checked={form.quoteOnly}
          onChange={(event) => set("quoteOnly", event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#b9f42e]"
        />
        <span>
          <span className="block text-xs font-bold text-white/70">Quote only — no checkout</span>
          <span className="block text-[11px] text-white/35">
            The brief opens a proposal request instead of taking payment. Price tiers are ignored.
          </span>
        </span>
      </label>

      {message && (
        <p className={`text-xs ${message === "Saved." ? "text-emerald-300" : "text-red-300"}`}>{message}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 flex-1 rounded-md border border-white/12 text-xs font-semibold text-white/55 transition hover:bg-white/[0.06]"
        >
          Close
        </button>
        <button
          type="button"
          disabled={saving || !form.name.trim()}
          onClick={save}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {isNew ? "Create gig" : "Save gig"}
        </button>
      </div>

      {!isNew && !form.quoteOnly && (
        <PackageEditor serviceId={form.id} packages={form.packages} onChanged={() => onSaved(form.id)} />
      )}
    </div>
  )
}

function PackageEditor({
  serviceId, packages, onChanged,
}: { serviceId: string; packages: OfferPackage[]; onChanged: () => void }) {
  const supabase = createClient()
  const [drafts, setDrafts] = useState<OfferPackage[]>(packages)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => { setDrafts(packages) }, [packages])

  const update = (index: number, patch: Partial<OfferPackage>) =>
    setDrafts((current) => current.map((option, i) => (i === index ? { ...option, ...patch } : option)))

  const save = async (option: OfferPackage) => {
    setBusy(option.id || "new")
    setMessage("")
    try {
      const { error } = await supabase.rpc("admin_upsert_managed_package", {
        p_id: option.id || null,
        p_service_id: serviceId,
        p_key: option.id ? option.key : toKey(option.key || option.name),
        p_name: option.name,
        p_summary: option.summary,
        p_video_count: option.videoCount,
        p_duration_seconds: option.durationSeconds,
        p_revisions: option.revisions,
        p_price_inr: option.priceInr,
        p_includes: option.includes,
        p_popular: option.popular,
        p_is_published: option.isPublished,
        p_position: option.position || null,
      })
      if (error) throw error
      onChanged()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not save that tier.")
    } finally {
      setBusy("")
    }
  }

  const remove = async (option: OfferPackage) => {
    if (!option.id) { setDrafts((current) => current.filter((entry) => entry !== option)); return }
    if (!confirm(`Delete the "${option.name}" tier?`)) return
    setBusy(option.id)
    try {
      const { error } = await supabase.rpc("admin_delete_managed_package", { p_id: option.id })
      if (error) throw error
      onChanged()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not delete that tier.")
    } finally {
      setBusy("")
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-[11px] font-bold uppercase tracking-wider text-white/35">Price tiers</h5>
        <button
          type="button"
          onClick={() => setDrafts((current) => [...current, { ...BLANK_PACKAGE, position: current.length + 1 }])}
          className="flex h-8 items-center gap-1.5 rounded-md border border-white/12 px-2.5 text-[11px] font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Plus className="h-3 w-3" />
          Add tier
        </button>
      </div>

      {message && <p className="mt-2 text-[11px] text-red-300">{message}</p>}

      <ul className="mt-3 space-y-3">
        {drafts.map((option, index) => (
          <li key={option.id || `new-${index}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={option.name} onChange={(value) => update(index, { name: value })} placeholder="UGC Ad Pack" />
              <Input value={option.summary} onChange={(value) => update(index, { summary: value })} placeholder="3 × 30-second videos" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberField label="Price ₹" value={option.priceInr} onChange={(value) => update(index, { priceInr: value })} />
              <NumberField label="Videos" value={option.videoCount} onChange={(value) => update(index, { videoCount: value })} />
              <NumberField label="Seconds" value={option.durationSeconds} onChange={(value) => update(index, { durationSeconds: value })} />
              <NumberField label="Revisions" value={option.revisions} onChange={(value) => update(index, { revisions: value })} />
            </div>
            <TextArea
              className="mt-2"
              value={option.includes.join("\n")}
              placeholder={"What's included, one per line"}
              onChange={(value) => update(index, { includes: value.split("\n").map((line) => line.trim()).filter(Boolean) })}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => update(index, { popular: !option.popular })}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                  option.popular ? "border-primary bg-primary/15 text-primary" : "border-white/12 text-white/45 hover:text-white"
                }`}
              >
                <Star className={`h-3 w-3 ${option.popular ? "fill-current" : ""}`} />
                Most picked
              </button>
              <button
                type="button"
                onClick={() => update(index, { isPublished: !option.isPublished })}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                  option.isPublished ? "border-white/12 text-white/55" : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                {option.isPublished ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {option.isPublished ? "Live" : "Hidden"}
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => remove(option)}
                className="grid h-8 w-8 place-items-center rounded-md border border-white/12 text-white/40 transition hover:bg-red-500/15 hover:text-red-300"
                aria-label="Delete tier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || !option.name.trim()}
                onClick={() => save(option)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
              >
                {busy === (option.id || "new") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save tier
              </button>
            </div>
          </li>
        ))}
        {drafts.length === 0 && (
          <li className="rounded-lg border border-dashed border-white/12 p-4 text-center text-[11px] text-white/30">
            No tiers yet — this gig cannot be bought until it has one.
          </li>
        )}
      </ul>
    </section>
  )
}

/**
 * Uploads to a public bucket and keeps the public URL.
 *
 * A promo video gets the same pre-flight an episode does: a file too heavy to
 * arrive in time plays its audio over a black frame, and on a sales page that
 * is the first thing a prospect sees.
 */
function MediaField({
  label, kind, bucket, folder, value, onChange,
}: {
  label: string
  kind: "image" | "video"
  bucket: string
  folder: string
  value: string
  onChange: (url: string) => void
}) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState("")

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError("")
    setWarnings([])
    try {
      if (kind === "image" && file.size > THUMB_MAX_BYTES) {
        throw new Error("Thumbnails must be 5 MB or smaller.")
      }
      if (kind === "video") {
        setWarnings(videoUploadProblems(await inspectVideoFile(file)))
      }
      const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || (kind === "image" ? "jpg" : "mp4")
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
      // A year: every object lands on a fresh random path and is never
      // rewritten, so a cached copy can never become wrong.
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, cacheControl: "31536000" })
      if (uploadError) throw new Error(uploadError.message)
      onChange(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div>
      <p className="text-xs font-bold text-white/55">{label}</p>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-black">
        <div className="grid aspect-video place-items-center">
          {value ? (
            kind === "image" ? (
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <video src={`${value}#t=0.1`} controls preload="metadata" className="h-full w-full object-contain" />
            )
          ) : (
            <span className="text-white/20">
              {kind === "image" ? <ImageIcon className="h-6 w-6" /> : <Film className="h-6 w-6" />}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/12 text-[11px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {value ? "Replace" : "Upload"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="grid h-8 w-8 place-items-center rounded-md border border-white/12 text-white/40 transition hover:text-white"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warnings.map((line) => (
            <li key={line} className="text-[11px] text-amber-200">{line}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-white/55">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-white/30">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/25 transition focus:border-primary focus:outline-none disabled:opacity-50"

function Input({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass}
    />
  )
}

function TextArea({ value, onChange, placeholder, className }: {
  value: string; onChange: (value: string) => void; placeholder?: string; className?: string
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${fieldClass} min-h-[80px] resize-y ${className ?? ""}`}
    />
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={`${fieldClass} mt-1`}
      />
    </label>
  )
}
