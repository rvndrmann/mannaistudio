"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Loader2, MessageSquare, PenLine, X } from "lucide-react"
import { useSignedMedia } from "@/components/managed/MediaThumb"
import type { ManagedStoryboardItem } from "@/components/managed/types"

/**
 * The storyboard, for the client to sign off frame by frame.
 *
 * Frames are what the team chose to show — keyframes, clips, characters and
 * products — never the production behind them. Each one is approved or sent
 * back with a sentence about what should change, and the whole round goes in
 * one submission: answering frame by frame would tell the team "approved" a
 * dozen times before the one note that matters arrived.
 *
 * Earlier rounds stay below, read-only, so "you said the bottle was too small
 * last time" can be checked rather than remembered.
 */

type Decision = { decision: "approved" | "changes_requested"; feedback: string }

const KIND_LABEL: Record<ManagedStoryboardItem["source_kind"], string> = {
  keyframe: "Frame",
  clip: "Clip",
  asset: "Character / product",
}

function FrameMedia({ item, onOpen }: { item: ManagedStoryboardItem; onOpen?: () => void }) {
  const url = useSignedMedia(item.storage_path)
  if (!url) return <div className="aspect-[3/4] w-full animate-pulse bg-white/[0.06]" aria-hidden />
  return item.media_type === "video" ? (
    <video src={url} controls playsInline preload="metadata" className="aspect-[3/4] w-full bg-black object-contain" />
  ) : (
    <button type="button" onClick={onOpen} className="block w-full" aria-label={`Open ${item.title || "frame"} full size`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={item.title} className="aspect-[3/4] w-full bg-black object-contain" />
    </button>
  )
}

function Lightbox({ item, onClose }: { item: ManagedStoryboardItem; onClose: () => void }) {
  const url = useSignedMedia(item.storage_path)
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white">
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={item.title} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />}
    </div>
  )
}

function StatusBadge({ status }: { status: ManagedStoryboardItem["status"] }) {
  if (status === "approved") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"><Check className="h-3 w-3" />Approved</span>
  }
  if (status === "changes_requested") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300"><PenLine className="h-3 w-3" />Changes requested</span>
  }
  return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">Awaiting your review</span>
}

export default function StoryboardReview({
  projectId, items, canAct, onSubmitted,
}: {
  projectId: string
  items: ManagedStoryboardItem[]
  canAct: boolean
  onSubmitted: () => void
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [lightbox, setLightbox] = useState<ManagedStoryboardItem | null>(null)

  const rounds = useMemo(() => {
    const map = new Map<number, ManagedStoryboardItem[]>()
    for (const item of items) map.set(item.round, [...(map.get(item.round) || []), item])
    return Array.from(map.entries())
      .sort(([a], [b]) => b - a)
      .map(([round, list]) => ({ round, items: [...list].sort((a, b) => a.position - b.position) }))
  }, [items])

  if (!rounds.length) return null

  const pending = items.filter((item) => item.status === "pending")
  const decided = pending.filter((item) => decisions[item.id])
  const incomplete = decided.find((item) => decisions[item.id].decision === "changes_requested" && !decisions[item.id].feedback.trim())

  const setDecision = (id: string, next: Decision | null) => setDecisions((current) => {
    const copy = { ...current }
    if (next) copy[id] = next
    else delete copy[id]
    return copy
  })

  const approveRest = () => setDecisions((current) => {
    const copy = { ...current }
    for (const item of pending) if (!copy[item.id]) copy[item.id] = { decision: "approved", feedback: "" }
    return copy
  })

  const submit = async () => {
    if (!decided.length || incomplete) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/managed/projects/${projectId}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: decided.map((item) => ({ itemId: item.id, ...decisions[item.id] })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Your review could not be sent.")
      setDecisions({})
      onSubmitted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your review could not be sent.")
    } finally {
      setBusy(false)
    }
  }

  const renderItem = (item: ManagedStoryboardItem, interactive: boolean) => {
    const choice = decisions[item.id]
    return (
      <article key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <FrameMedia item={item} onOpen={() => setLightbox(item)} />
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{item.title || `Frame ${item.position}`}</p>
              <p className="text-[10px] text-white/35">{KIND_LABEL[item.source_kind]}</p>
            </div>
            {!interactive && <StatusBadge status={item.status} />}
          </div>
          {item.caption && <p className="text-[11px] leading-relaxed text-white/55">{item.caption}</p>}

          {!interactive && item.feedback && (
            <p className="flex gap-1.5 rounded-lg bg-white/[0.04] p-2 text-[11px] leading-relaxed text-white/65">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-white/35" />
              <span className="whitespace-pre-wrap">{item.feedback}</span>
            </p>
          )}

          {interactive && (
            <div className="mt-auto space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDecision(item.id, choice?.decision === "approved" ? null : { decision: "approved", feedback: "" })}
                  aria-pressed={choice?.decision === "approved"}
                  className={`flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition ${
                    choice?.decision === "approved"
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                      : "border-white/12 text-white/60 hover:text-white"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecision(item.id, choice?.decision === "changes_requested" ? null : { decision: "changes_requested", feedback: choice?.feedback || "" })}
                  aria-pressed={choice?.decision === "changes_requested"}
                  className={`flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition ${
                    choice?.decision === "changes_requested"
                      ? "border-amber-300 bg-amber-400/20 text-amber-100"
                      : "border-white/12 text-white/60 hover:text-white"
                  }`}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Change
                </button>
              </div>
              {choice?.decision === "changes_requested" && (
                <textarea
                  autoFocus
                  value={choice.feedback}
                  onChange={(event) => setDecision(item.id, { decision: "changes_requested", feedback: event.target.value })}
                  maxLength={5000}
                  placeholder="What should change? e.g. Make the bottle bigger and the label readable."
                  className="min-h-[70px] w-full resize-y rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[11px] text-white placeholder:text-white/25 focus:border-amber-300 focus:outline-none"
                />
              )}
            </div>
          )}
        </div>
      </article>
    )
  }

  const [current, ...earlier] = rounds
  // Any round with an unanswered frame is still open — a second round can
  // arrive before the first was answered, and those frames still need a verdict.
  const currentOpen = canAct && pending.length > 0
  const earlierPending = earlier.some((round) => round.items.some((item) => item.status === "pending"))

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Storyboard review</h2>
        <p className="text-[11px] text-white/35">
          Round {current.round} · {current.items.filter((item) => item.status === "approved").length} of {current.items.length} approved
        </p>
      </div>
      <p className="-mt-1 mb-3 text-xs leading-relaxed text-white/45">
        {currentOpen
          ? "Approve each frame, or tell us what should change before we animate and edit. Changes here cost nothing — they are much cheaper now than after the video is cut."
          : "Your answers on the frames we sent. The team works from these before animating and editing."}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {current.items.map((item) => renderItem(item, canAct && item.status === "pending"))}
      </div>

      {currentOpen && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-white/45">
            {decided.length} of {pending.length} frame(s) answered
            {incomplete && <span className="text-amber-300"> · add a note to each frame you want changed</span>}
          </p>
          <div className="flex gap-2">
            {decided.length < pending.length && (
              <button
                type="button"
                onClick={approveRest}
                className="h-9 rounded-md border border-white/12 px-3 text-[11px] font-semibold text-white/60 transition hover:text-white"
              >
                Approve the rest
              </button>
            )}
            <button
              type="button"
              disabled={busy || !decided.length || Boolean(incomplete)}
              onClick={submit}
              className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[11px] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send review
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      {earlier.length > 0 && (
        <details open={earlierPending || undefined} className="group mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-white/60">
            Earlier rounds ({earlier.length})
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-4">
            {earlier.map((round) => (
              <div key={round.round}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Round {round.round}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {round.items.map((item) => renderItem(item, canAct && item.status === "pending"))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </section>
  )
}
