"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BellRing, Check, Loader2, Mail, Phone, Send } from "lucide-react"

type NotifyRequest = {
  id: string
  series_id: string
  series_title: string
  episode_number: number
  profile_id: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  notified_at: string | null
  created_at: string
}

/**
 * Who is waiting for which episode, grouped by episode number.
 *
 * Grouped rather than listed flat because the question an admin actually has
 * after uploading episode four is "who do I tell", and that is one group.
 */
export default function OriginalsNotifyList({ seriesId, seriesTitle }: { seriesId: string; seriesTitle: string }) {
  const [requests, setRequests] = useState<NotifyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<number | null>(null)
  const [status, setStatus] = useState<{ tone: "ok" | "error"; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/originals/notify?seriesId=${seriesId}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load the waiting list")
      setRequests(data.requests || [])
    } catch (err) {
      setStatus({ tone: "error", message: err instanceof Error ? err.message : "Could not load the waiting list" })
    } finally {
      setLoading(false)
    }
  }, [seriesId])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const byEpisode = new Map<number, NotifyRequest[]>()
    for (const request of requests) {
      const list = byEpisode.get(request.episode_number) || []
      list.push(request)
      byEpisode.set(request.episode_number, list)
    }
    return Array.from(byEpisode.entries()).sort((a, b) => a[0] - b[0])
  }, [requests])

  const send = async (episodeNumber: number) => {
    setSending(episodeNumber)
    setStatus(null)
    try {
      const res = await fetch("/api/admin/originals/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, episodeNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not send")
      const phones = (data.phoneOnly || []).length
      setStatus({
        tone: "ok",
        message: `Emailed ${data.sent}${data.failed ? `, ${data.failed} failed` : ""}` +
          (phones ? ` · ${phones} left a phone number only — those need messaging by hand` : ""),
      })
      await load()
    } catch (err) {
      setStatus({ tone: "error", message: err instanceof Error ? err.message : "Could not send" })
    } finally {
      setSending(null)
    }
  }

  const copyContacts = (rows: NotifyRequest[]) => {
    const text = rows.map((row) => [row.email, row.phone].filter(Boolean).join(" / ")).join("\n")
    navigator.clipboard.writeText(text).then(
      () => setStatus({ tone: "ok", message: "Contacts copied" }),
      () => setStatus({ tone: "error", message: "Could not copy" }),
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the waiting list...
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-white/35">
        Nobody has asked to be notified about {seriesTitle} yet.
      </p>
    )
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {status && (
        <p className={`text-xs ${status.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>{status.message}</p>
      )}

      {groups.map(([episodeNumber, rows]) => {
        const pending = rows.filter((row) => !row.notified_at)
        return (
          <div key={episodeNumber} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Episode {episodeNumber}</span>
                <span className="text-xs text-white/40">
                  {rows.length} waiting{pending.length !== rows.length ? ` · ${rows.length - pending.length} already told` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyContacts(rows)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
                >
                  Copy contacts
                </button>
                <button
                  type="button"
                  onClick={() => send(episodeNumber)}
                  disabled={sending === episodeNumber || pending.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-black transition hover:brightness-110 disabled:opacity-40"
                >
                  {sending === episodeNumber ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Notify {pending.length}
                </button>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
                  <span className="font-medium text-white/80">{row.full_name || "Guest"}</span>
                  {row.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>
                  )}
                  {row.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>
                  )}
                  {row.notified_at && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Check className="h-3 w-3" />told
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
