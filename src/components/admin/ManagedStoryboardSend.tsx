"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Images, Loader2, MessageSquareWarning, RefreshCcw, Send } from "lucide-react"

/**
 * Send storyboard frames to the client.
 *
 * Every keyframe, clip and asset image in the order's Studio production, as a
 * grid to tick. What was ticked is copied into the client's folder and arrives
 * on their project page as a numbered round they approve frame by frame.
 *
 * Each tile carries the client's latest verdict on that frame, feedback
 * included, so a producer deciding what to resend can see what came back
 * without opening the Studio — though the same words are filed there too, on
 * the shot itself.
 */

type Candidate = {
  key: string
  kind: "keyframe" | "clip" | "asset"
  shotId: string | null
  entityId: string | null
  title: string
  group: string
  mediaType: "image" | "video"
  url: string
  lastReview: { status: string; round: number; feedback: string } | null
}

const KIND_LABEL: Record<Candidate["kind"], string> = { keyframe: "Image", clip: "Clip", asset: "Asset" }

function ReviewChip({ review }: { review: Candidate["lastReview"] }) {
  if (!review) return null
  const tone = review.status === "approved"
    ? "bg-emerald-500/85 text-black"
    : review.status === "changes_requested"
      ? "bg-amber-400/90 text-black"
      : "bg-sky-500/80 text-black"
  const label = review.status === "approved" ? "Approved" : review.status === "changes_requested" ? "Changes" : "With client"
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>R{review.round} · {label}</span>
}

export default function ManagedStoryboardSend({ projectId, onSent }: { projectId: string; onSent: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [filter, setFilter] = useState<"all" | Candidate["kind"]>("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/managed/${projectId}/storyboard`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load the storyboard.")
      setCandidates(data.candidates || [])
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the storyboard.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(
    () => candidates.filter((candidate) => filter === "all" || candidate.kind === filter),
    [candidates, filter],
  )
  const groups = useMemo(() => {
    const map = new Map<string, Candidate[]>()
    for (const candidate of visible) map.set(candidate.group, [...(map.get(candidate.group) || []), candidate])
    return Array.from(map.entries())
  }, [visible])

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const send = async () => {
    const items = candidates
      .filter((candidate) => selected.has(candidate.key))
      .map((candidate) => ({
        kind: candidate.kind,
        ...(candidate.shotId ? { shotId: candidate.shotId } : {}),
        ...(candidate.entityId ? { entityId: candidate.entityId } : {}),
      }))
    if (!items.length) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch(`/api/admin/managed/${projectId}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not send the storyboard.")
      setNotice(`Round ${data.round} sent — ${data.sent} frame(s) are with the client.`)
      setSelected(new Set())
      setNote("")
      await load()
      onSent()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the storyboard.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/35">
          <Images className="h-3.5 w-3.5" />
          Storyboard review
        </h4>
        <div className="flex items-center gap-1.5">
          {(["all", "keyframe", "clip", "asset"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                filter === value ? "border-primary bg-primary/15 text-primary" : "border-white/12 text-white/45 hover:text-white"
              }`}
            >
              {value === "all" ? "All" : `${KIND_LABEL[value]}s`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh storyboard"
            className="grid h-7 w-7 place-items-center rounded-md border border-white/12 text-white/45 transition hover:text-white"
          >
            <RefreshCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
        Tick the frames the client should sign off before you animate or cut. They approve each one or say
        what to change — and their answer is also filed on that shot in Creator Studio.
      </p>

      {loading ? (
        <div className="mt-3 grid h-24 place-items-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
      ) : candidates.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-white/12 p-4 text-center text-[11px] text-white/35">
          Nothing generated yet. Keyframes, clips and asset images from the Studio production appear here.
        </p>
      ) : (
        <div className="mt-3 max-h-[460px] space-y-4 overflow-y-auto pr-1">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">{group}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {items.map((candidate) => {
                  const active = selected.has(candidate.key)
                  return (
                    <button
                      key={candidate.key}
                      type="button"
                      onClick={() => toggle(candidate.key)}
                      aria-pressed={active}
                      className={`group relative overflow-hidden rounded-lg border text-left transition ${
                        active ? "border-primary ring-1 ring-primary/50" : "border-white/10 hover:border-white/25"
                      }`}
                    >
                      <div className="relative aspect-[3/4] bg-black">
                        {candidate.url && (candidate.mediaType === "video" ? (
                          <video src={`${candidate.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={candidate.url} alt="" className="h-full w-full object-cover" />
                        ))}
                        <span className={`absolute left-1.5 top-1.5 grid h-4 w-4 place-items-center rounded border ${
                          active ? "border-primary bg-primary text-black" : "border-white/40 bg-black/50 text-transparent"
                        }`}>
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white/80">
                          {KIND_LABEL[candidate.kind]}
                        </span>
                        <span className="absolute bottom-1.5 left-1.5"><ReviewChip review={candidate.lastReview} /></span>
                      </div>
                      <p className="truncate px-1.5 py-1 text-[10px] text-white/60">{candidate.title}</p>
                      {candidate.lastReview?.status === "changes_requested" && candidate.lastReview.feedback && (
                        <p className="flex gap-1 border-t border-white/[0.06] px-1.5 py-1 text-[10px] leading-snug text-amber-200/90">
                          <MessageSquareWarning className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                          <span className="line-clamp-3">{candidate.lastReview.feedback}</span>
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder="Note to the client (optional) — e.g. Here are the opening frames. Tell us if the product angle works."
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={send}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {selected.size ? `Send ${selected.size} for client review` : "Select frames to send"}
          </button>
        </div>
      )}

      {notice && <p className="mt-2 text-[11px] text-emerald-300">{notice}</p>}
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
    </section>
  )
}
