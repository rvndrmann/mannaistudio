"use client"

import { Check, Clock, Download, Eye, Film, Loader2, RotateCcw } from "lucide-react"
import MediaThumb from "@/components/managed/MediaThumb"
import { downloadSignedMedia } from "@/lib/studio/signed-media"
import { DELIVERABLE_STATUS_LABELS, formatTimecode } from "@/lib/managed-production"
import type { ManagedDeliverable, ManagedVersion } from "@/components/managed/types"

/**
 * The videos, as the client sees them.
 *
 * Only published versions appear here. Everything the production actually
 * generated — the prompts, the rejected takes, the storyboard — lives in the
 * Creator Studio and has no path into this list: a deliverable shows what was
 * deliberately sent, and nothing else.
 */

const STATUS_STYLES: Record<string, string> = {
  in_production: "border-white/12 text-white/45",
  ready_for_review: "border-primary/40 bg-primary/10 text-primary",
  revision_requested: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
}

export default function Deliverables({
  deliverables, versions, revisionsIncluded, onOpen,
}: {
  deliverables: ManagedDeliverable[]
  versions: ManagedVersion[]
  revisionsIncluded: number
  onOpen: (deliverable: ManagedDeliverable) => void
}) {
  if (!deliverables.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center">
        <Film className="mx-auto mb-3 h-6 w-6 text-white/25" />
        <p className="text-sm text-white/45">Your videos will appear here as soon as the first cut is ready.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {deliverables.map((deliverable) => {
        const own = versions
          .filter((version) => version.deliverable_id === deliverable.id)
          .sort((a, b) => b.version_number - a.version_number)
        const latest = own[0] || null

        return (
          <article key={deliverable.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="relative aspect-video bg-black">
              {latest ? (
                <MediaThumb path={latest.storage_path} alt={deliverable.title} className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-white/25">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              <span
                className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur ${
                  STATUS_STYLES[deliverable.status] || STATUS_STYLES.in_production
                }`}
              >
                {DELIVERABLE_STATUS_LABELS[deliverable.status] || deliverable.status}
              </span>
            </div>

            <div className="p-4">
              <h3 className="truncate text-sm font-bold">{deliverable.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/35">
                <span>{latest ? latest.label : "Awaiting first cut"}</span>
                {latest?.duration_seconds ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimecode(latest.duration_seconds)}
                    </span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>{deliverable.aspect_ratio}</span>
                {deliverable.revisions_used > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{deliverable.revisions_used} of {revisionsIncluded} revisions used</span>
                  </>
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!latest}
                  onClick={() => onOpen(deliverable)}
                  className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-black transition hover:brightness-110 active:scale-[0.97] disabled:opacity-30"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {deliverable.status === "approved" ? "Watch" : "Review"}
                </button>
                {latest && deliverable.status !== "approved" && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(deliverable)}
                      className="flex h-9 items-center gap-1.5 rounded-md border border-white/12 px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(deliverable)}
                      className="flex h-9 items-center gap-1.5 rounded-md border border-white/12 px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Request revision
                    </button>
                  </>
                )}
                {latest && (
                  <button
                    type="button"
                    onClick={() => downloadSignedMedia(latest.storage_path, `${deliverable.title} ${latest.label}.mp4`)}
                    className="flex h-9 items-center gap-1.5 rounded-md border border-white/12 px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/**
 * The delivery area, once something has been approved.
 *
 * Grouped by aspect ratio because that is how the files get used — the person
 * downloading them is about to upload a 9:16 to Reels and a 16:9 to YouTube,
 * and a flat list makes them read filenames to work out which is which.
 */
export function FinalDelivery({
  deliverables, versions,
}: { deliverables: ManagedDeliverable[]; versions: ManagedVersion[] }) {
  const approved = deliverables.filter((deliverable) => deliverable.status === "approved")
  if (!approved.length) return null

  const groups = new Map<string, Array<{ deliverable: ManagedDeliverable; version: ManagedVersion }>>()
  for (const deliverable of approved) {
    const own = versions
      .filter((version) => version.deliverable_id === deliverable.id)
      .sort((a, b) => b.version_number - a.version_number)
    const final = own.find((version) => version.is_final) || own[0]
    if (!final) continue
    const key = deliverable.aspect_ratio || "9:16"
    groups.set(key, [...(groups.get(key) || []), { deliverable, version: final }])
  }

  const RATIO_LABELS: Record<string, string> = {
    "9:16": "Vertical 9:16",
    "1:1": "Square 1:1",
    "16:9": "Landscape 16:9",
  }

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-5">
      <h2 className="text-lg font-bold tracking-tight">Your videos are ready 🎬</h2>
      <p className="mt-1 text-xs text-white/45">Approved and final. Download each one below.</p>

      <div className="mt-5 space-y-5">
        {Array.from(groups.entries()).map(([ratio, items]) => (
          <div key={ratio}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
              {RATIO_LABELS[ratio] || ratio}
            </h3>
            <ul className="mt-2 space-y-2">
              {items.map(({ deliverable, version }) => (
                <li
                  key={version.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-2.5"
                >
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                    <MediaThumb path={version.storage_path} alt={deliverable.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{deliverable.title}</p>
                    <p className="text-[11px] text-white/35">{version.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadSignedMedia(version.storage_path, `${deliverable.title}.mp4`)}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-black transition hover:brightness-110 active:scale-[0.97]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download MP4
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
