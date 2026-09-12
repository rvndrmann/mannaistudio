"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Check, Clock, Download, Loader2, Pause, Play, Plus, Trash2, X } from "lucide-react"
import { useSignedMedia } from "@/components/managed/MediaThumb"
import { AttachmentPicker } from "@/components/managed/BriefFields"
import { downloadSignedMedia } from "@/lib/studio/signed-media"
import { formatTimecode } from "@/lib/managed-production"
import { springSheet } from "@/lib/motion"
import type { ManagedAttachment } from "@/lib/managed-brief"
import type { ManagedComment, ManagedDeliverable, ManagedVersion } from "@/components/managed/types"

/**
 * Watching a cut and saying what should change.
 *
 * The player and the feedback form are one screen because they are one act:
 * leaving a note at 00:08 means having 00:08 on screen. "Note this moment"
 * takes the timestamp from the player rather than asking anyone to read it off
 * and type it, which is the difference between timestamped feedback people
 * actually leave and timestamped feedback they say they will leave later.
 *
 * Previous versions stay watchable from the same sheet. A revision conversation
 * is mostly about what changed between two cuts, and a V1 that disappeared when
 * V2 arrived makes that impossible to check.
 */

type PendingComment = { id: string; timestampSeconds: number | null; body: string }

export default function ReviewSheet({
  deliverable, versions, comments, canAct, onClose, onSubmitted,
}: {
  deliverable: ManagedDeliverable
  versions: ManagedVersion[]
  comments: ManagedComment[]
  canAct: boolean
  onClose: () => void
  onSubmitted: () => void
}) {
  const ordered = [...versions].sort((a, b) => b.version_number - a.version_number)
  const [activeId, setActiveId] = useState(ordered[0]?.id || "")
  const active = ordered.find((version) => version.id === activeId) || ordered[0] || null
  const url = useSignedMedia(active?.storage_path)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)

  const [mode, setMode] = useState<"watch" | "revision">("watch")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState<PendingComment[]>([])
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<ManagedAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmApprove, setConfirmApprove] = useState(false)

  // Escape closes it, which is what anyone who opened a sheet expects.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const versionComments = comments
    .filter((comment) => comment.version_id === active?.id || (!comment.version_id && comment.deliverable_id === deliverable.id))
    .sort((a, b) => (a.timestamp_seconds ?? -1) - (b.timestamp_seconds ?? -1))

  const seek = (seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = seconds
    videoRef.current.play().catch(() => undefined)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => undefined)
    else video.pause()
  }

  const addPending = () => {
    if (!draft.trim()) return
    setPending((current) => [
      ...current,
      { id: crypto.randomUUID(), timestampSeconds: Math.floor(position), body: draft.trim() },
    ])
    setDraft("")
  }

  const act = async (action: "approve" | "revision") => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/managed/projects/${deliverable.project_id}/deliverables/${deliverable.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { action: "approve" }
            : {
                action: "revision",
                notes,
                comments: pending.map(({ timestampSeconds, body }) => ({ timestampSeconds, body })),
                attachments,
              },
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "That could not be submitted.")
      onSubmitted()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be submitted.")
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSheet}
        className="material-sheet flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[22px] sm:rounded-[22px]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{deliverable.title}</h2>
            <p className="text-xs text-white/40">
              {active ? `${active.label} · ${new Date(active.created_at).toLocaleDateString()}` : "No cut yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_340px] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col bg-black/40 p-4">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
              {url ? (
                <video
                  ref={videoRef}
                  src={url}
                  playsInline
                  controls={false}
                  className="max-h-[52vh] w-full object-contain"
                  onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
                  onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={togglePlay}
                />
              ) : (
                <div className="grid h-[40vh] w-full place-items-center text-white/30">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-black transition active:scale-95"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={position}
                onChange={(event) => seek(Number(event.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#b9f42e]"
                aria-label="Scrub"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">
                {formatTimecode(position)} / {formatTimecode(duration)}
              </span>
              {active && (
                <button
                  type="button"
                  onClick={() => downloadSignedMedia(active.storage_path, `${deliverable.title} ${active.label}.mp4`)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/12 text-white/60 transition hover:bg-white/10 hover:text-white"
                  aria-label="Download this version"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
            </div>

            {ordered.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ordered.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setActiveId(version.id)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                      version.id === active?.id
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    {version.label}
                    {version.is_final && " · Final"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col border-t border-white/[0.08] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 gap-1 p-3">
              {(["watch", "revision"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  disabled={option === "revision" && !canAct}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:opacity-30 ${
                    mode === option ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                  }`}
                >
                  {option === "watch" ? "Notes so far" : "Request changes"}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {mode === "watch" ? (
                versionComments.length ? (
                  <ul className="space-y-2">
                    {versionComments.map((comment) => (
                      <li key={comment.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                        {comment.timestamp_seconds !== null && (
                          <button
                            type="button"
                            onClick={() => seek(comment.timestamp_seconds || 0)}
                            className="mb-1 flex items-center gap-1 font-mono text-[11px] font-bold text-primary"
                          >
                            <Clock className="h-3 w-3" />
                            {formatTimecode(comment.timestamp_seconds)}
                          </button>
                        )}
                        <p className="text-xs leading-relaxed text-white/70">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-xs text-white/30">No notes on this version yet.</p>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-white/55">Note this moment</p>
                    <p className="mt-0.5 text-[11px] text-white/30">
                      Pause where something should change — we take the timecode from the player.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <span className="grid shrink-0 place-items-center rounded-lg bg-white/[0.06] px-2.5 font-mono text-[11px] font-bold text-primary">
                        {formatTimecode(position)}
                      </span>
                      <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPending() } }}
                        placeholder="Change this product shot"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addPending}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
                        aria-label="Add note"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {pending.length > 0 && (
                    <ul className="space-y-1.5">
                      {pending.map((comment) => (
                        <li key={comment.id} className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.07] p-2.5">
                          <span className="shrink-0 font-mono text-[11px] font-bold text-primary">
                            {formatTimecode(comment.timestampSeconds ?? 0)}
                          </span>
                          <span className="min-w-0 flex-1 text-xs text-white/75">{comment.body}</span>
                          <button
                            type="button"
                            onClick={() => setPending((current) => current.filter((item) => item.id !== comment.id))}
                            className="shrink-0 text-white/30 transition hover:text-red-300"
                            aria-label="Remove note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div>
                    <p className="text-xs font-bold text-white/55">Anything else</p>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="General notes on this cut…"
                      className="mt-2 min-h-[90px] w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
                    />
                  </div>

                  <AttachmentPicker
                    kind="reference"
                    label="Attach a reference"
                    accept="image/*,video/*,application/pdf"
                    value={attachments}
                    onChange={setAttachments}
                    projectId={deliverable.project_id}
                  />
                </div>
              )}
            </div>

            {canAct && (
              <div className="shrink-0 space-y-2 border-t border-white/[0.08] p-4">
                {error && <p className="text-xs text-red-300">{error}</p>}
                {mode === "revision" ? (
                  <button
                    type="button"
                    disabled={busy || (!notes.trim() && !pending.length)}
                    onClick={() => act("revision")}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white/10 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Request revision
                  </button>
                ) : confirmApprove ? (
                  <div className="space-y-2">
                    <p className="text-xs text-white/60">Approve {active?.label} as final?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmApprove(false)}
                        className="h-10 flex-1 rounded-md border border-white/12 text-xs font-semibold text-white/60 transition hover:bg-white/[0.06]"
                      >
                        Not yet
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act("approve")}
                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-xs font-semibold text-black transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Approve
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => setConfirmApprove(true)}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                    Approve video
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </motion.div>
    </div>
  )
}
