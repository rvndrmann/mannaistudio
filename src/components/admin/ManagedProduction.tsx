"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Clapperboard, ExternalLink, Film, Inbox, Loader2, Plus, RefreshCcw, Send, Tags, Wand2,
} from "lucide-react"
import { formatUsdWithInr } from "@/lib/currency"
import { MANAGED_STATUSES, MANAGED_STATUS_LABELS } from "@/lib/managed-production"
import { offerServiceName } from "@/lib/managed-offers"
import ManagedOffers from "@/components/admin/ManagedOffers"
import { briefDigest, parseManagedBrief } from "@/lib/managed-brief"
import type { ManagedProjectPayload } from "@/components/managed/types"

/**
 * The producer's queue.
 *
 * Orders down the left grouped by what they are waiting on, one order open on
 * the right with the four things a producer does: move it along, open the
 * Creator Studio production, name the deliverables, and send a cut to the
 * client.
 *
 * The client-facing view of the same project is one click away rather than
 * rebuilt here — a producer should be reading exactly what their client reads,
 * and two renderings of the same project is two chances for them to disagree.
 */

type QueueRow = {
  id: string
  name: string
  service_type: string
  status: string
  payment_status: string
  price_inr: number
  video_count: number
  duration_seconds: number
  aspect_ratio: string
  owner_name: string
  owner_email: string
  studio_project_id: string | null
  offer_snapshot: unknown
  deliverables: number
  ready_for_review: number
  approved: number
  unread_messages: number
  created_at: string
}

const BUCKETS = [
  { key: "new", label: "New Orders", statuses: ["brief_received"] },
  { key: "production", label: "In Production", statuses: ["creative_research", "script_in_progress", "production", "finalizing"] },
  { key: "waiting", label: "Waiting for Client", statuses: ["script_review", "first_cut"] },
  { key: "revision", label: "Revision Requested", statuses: ["revision_requested"] },
  { key: "done", label: "Completed", statuses: ["completed", "cancelled"] },
] as const

export default function ManagedProduction() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<"orders" | "offers">("orders")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/managed")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load managed orders.")
      setRows(data.projects || [])
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load managed orders.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(
    () => BUCKETS.map((bucket) => ({
      ...bucket,
      rows: rows.filter((row) => (bucket.statuses as readonly string[]).includes(row.status)),
    })),
    [rows],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Managed Production</h2>
          <p className="mt-1 text-sm text-white/40">
            Orders placed from Hire Our Creative Team. Produced in the Studio, delivered here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-white/12 p-0.5">
            {([["orders", "Orders", Inbox], ["offers", "Offers", Tags]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold transition ${
                  view === key ? "bg-primary text-black" : "text-white/45 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {view === "orders" && (
            <button
              type="button"
              onClick={load}
              className="flex h-9 items-center gap-2 rounded-md border border-white/12 px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          )}
        </div>
      </div>

      {view === "offers" && <ManagedOffers />}

      {view === "orders" && error && (
        <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
      )}

      {view === "orders" && (loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center">
          <Inbox className="mx-auto mb-3 h-6 w-6 text-white/25" />
          <p className="text-sm text-white/40">No managed orders yet.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            {grouped.filter((bucket) => bucket.rows.length > 0).map((bucket) => (
              <section key={bucket.key}>
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/35">
                  {bucket.label}
                  <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/50">{bucket.rows.length}</span>
                </h3>
                <ul className="space-y-2">
                  {bucket.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(row.id === openId ? null : row.id)}
                        className={`w-full rounded-xl border p-3.5 text-left transition ${
                          row.id === openId
                            ? "border-primary/50 bg-primary/[0.08]"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-bold">{row.name}</p>
                          {row.unread_messages > 0 && (
                            <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {row.unread_messages}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-white/35">
                          {row.owner_name || row.owner_email} · {offerServiceName(row.offer_snapshot, row.service_type)}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/30">
                          <span>{row.video_count} × {row.duration_seconds}s</span>
                          <span aria-hidden>·</span>
                          <span>{row.price_inr > 0 ? formatUsdWithInr(row.price_inr) : "Quote"}</span>
                          {row.ready_for_review > 0 && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-primary">{row.ready_for_review} with client</span>
                            </>
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div>
            {openId ? (
              <OrderPanel projectId={openId} onChanged={load} />
            ) : (
              <div className="grid h-full min-h-[280px] place-items-center rounded-2xl border border-dashed border-white/12 text-sm text-white/30">
                Pick an order to open it.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function OrderPanel({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [data, setData] = useState<ManagedProjectPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/managed/projects/${projectId}`)
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Could not load this order.")
      setData(payload)
      setNote(payload.project.admin_note || "")
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this order.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label)
    setError("")
    try {
      const res = await fetch(`/api/admin/managed/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "That did not work.")
      await load()
      onChanged()
      return result
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.")
      return null
    } finally {
      setBusy("")
    }
  }

  if (loading || !data) {
    return (
      <div className="grid h-full min-h-[280px] place-items-center rounded-2xl border border-white/10">
        {error ? <p className="text-sm text-red-200">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      </div>
    )
  }

  const { project, deliverables, versions } = data
  const brief = parseManagedBrief(project.brief)

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight">{project.name}</h3>
          <p className="mt-0.5 text-xs text-white/35">
            {offerServiceName(project.offer_snapshot, project.service_type)} · {project.video_count} × {project.duration_seconds}s ·{" "}
            {project.aspect_ratio} · {project.price_inr > 0 ? formatUsdWithInr(project.price_inr) : "Quote"}
          </p>
        </div>
        <Link
          href={`/hire-us/projects/${project.id}`}
          target="_blank"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/12 px-3 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Client view
        </Link>
      </header>

      {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/35">Status</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...MANAGED_STATUSES, "cancelled"].map((status) => (
            <button
              key={status}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => act({ action: "status", status, note }, `status-${status}`)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                project.status === status
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-white/12 text-white/45 hover:text-white"
              }`}
            >
              {busy === `status-${status}` ? "…" : MANAGED_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Internal note — never shown to the client."
          className="mt-2.5 min-h-[60px] w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
        />
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/35">
          <Clapperboard className="h-3.5 w-3.5" />
          Creator Studio
        </h4>
        {project.studio_project_id ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/studio/project/${project.studio_project_id}`}
              className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-black transition hover:brightness-110"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Open production
            </Link>
            <span className="text-[11px] text-white/30">
              The client never sees this project, its prompts, or its unused takes.
            </span>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
              Opens a Studio production owned by you, seeded with the brief, the brand rules and the
              client&rsquo;s uploaded product art.
            </p>
            <button
              type="button"
              disabled={Boolean(busy) || project.payment_status !== "paid"}
              onClick={() => act({ action: "open_studio" }, "studio")}
              className="mt-2.5 flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy === "studio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create in Creator Studio
            </button>
            {project.payment_status !== "paid" && (
              <p className="mt-2 text-[11px] text-white/30">Available once the order is paid.</p>
            )}
          </>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/35">Deliverables</h4>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => act({ action: "deliverable", deliverableId: null, title: "" }, "deliverable")}
            className="flex h-8 items-center gap-1.5 rounded-md border border-white/12 px-2.5 text-[11px] font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {deliverables.map((deliverable) => (
            <DeliverableRow
              key={deliverable.id}
              projectId={project.id}
              deliverable={deliverable}
              versions={versions.filter((version) => version.deliverable_id === deliverable.id)}
              onRename={(title) => act({ action: "deliverable", deliverableId: deliverable.id, title }, `rename-${deliverable.id}`)}
              onPublished={() => { load(); onChanged() }}
            />
          ))}
          {deliverables.length === 0 && (
            <li className="rounded-xl border border-dashed border-white/12 p-4 text-center text-[11px] text-white/30">
              No deliverables yet.
            </li>
          )}
        </ul>
      </section>

      <details className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-white/35">
          The brief
        </summary>
        <pre className="mt-3 whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">{briefDigest(brief)}</pre>
        {brief.attachments.length > 0 && (
          <p className="mt-3 text-[11px] text-white/35">
            {brief.attachments.length} file(s) attached — imported into the Studio production as references.
          </p>
        )}
      </details>
    </div>
  )
}

function DeliverableRow({
  projectId, deliverable, versions, onRename, onPublished,
}: {
  projectId: string
  deliverable: ManagedProjectPayload["deliverables"][number]
  versions: ManagedProjectPayload["versions"]
  onRename: (title: string) => void
  onPublished: () => void
}) {
  const [title, setTitle] = useState(deliverable.title)
  const [sending, setSending] = useState(false)

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => { if (title.trim() && title !== deliverable.title) onRename(title.trim()) }}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white focus:border-primary focus:outline-none"
        />
        <span className="shrink-0 rounded-full border border-white/12 px-2.5 py-1 text-[10px] font-bold text-white/45">
          {deliverable.status.replace(/_/g, " ")}
        </span>
        <button
          type="button"
          onClick={() => setSending((open) => !open)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-black transition hover:brightness-110"
        >
          <Send className="h-3 w-3" />
          Send to client
        </button>
      </div>
      {versions.length > 0 && (
        <p className="mt-1.5 text-[11px] text-white/30">
          {versions.map((version) => version.label).join(" · ")}
        </p>
      )}
      {sending && (
        <PublishForm
          projectId={projectId}
          deliverableId={deliverable.id}
          nextVersion={versions.length + 1}
          onDone={() => { setSending(false); onPublished() }}
        />
      )}
    </li>
  )
}

/**
 * Send to Client.
 *
 * Lists what is finished in the linked Studio production, plus anything
 * uploaded into this order's own folder — which is how a browser-side timeline
 * export gets published: the Studio's export modal saves the stitched file to
 * disk, and it is re-uploaded here as the finished cut.
 */
function PublishForm({
  projectId, deliverableId, nextVersion, onDone,
}: { projectId: string; deliverableId: string; nextVersion: number; onDone: () => void }) {
  const [clips, setClips] = useState<Array<{ path: string; label: string; source: string; url: string }>>([])
  const [loading, setLoading] = useState(true)
  const [sourcePath, setSourcePath] = useState("")
  const [label, setLabel] = useState(`V${nextVersion}`)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/admin/managed/${projectId}/studio-exports`)
      .then((response) => response.json())
      .then((data) => { if (active) setClips(data.clips || []) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const publish = async () => {
    if (!sourcePath) { setError("Pick a file to send."); return }
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/managed/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverableId, sourcePath, label, note, durationSeconds: null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not publish that version.")
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish that version.")
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
      {loading ? (
        <p className="text-[11px] text-white/40">Looking for finished clips…</p>
      ) : clips.length === 0 ? (
        <p className="text-[11px] text-white/40">
          Nothing finished yet. Generate a shot in the Studio production, or upload the export into this
          project&rsquo;s chat and it will appear here.
        </p>
      ) : (
        <select
          value={sourcePath}
          onChange={(event) => setSourcePath(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white focus:border-primary focus:outline-none"
        >
          <option value="">Choose a file…</option>
          {clips.map((clip) => (
            <option key={clip.path} value={clip.path}>
              {clip.source === "upload" ? "Uploaded" : "Studio"} — {clip.label}
            </option>
          ))}
        </select>
      )}

      {sourcePath && (
        <video
          src={clips.find((clip) => clip.path === sourcePath)?.url}
          controls
          className="max-h-40 w-full rounded-lg bg-black"
        />
      )}

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="V1"
          className="w-24 shrink-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white focus:border-primary focus:outline-none"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Your first version is ready for review."
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
        />
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}

      <button
        type="button"
        disabled={busy || !sourcePath}
        onClick={publish}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
        Publish to client
      </button>
    </div>
  )
}
