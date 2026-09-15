"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Mail, RefreshCcw, UserX } from "lucide-react"
import { briefDigest, parseManagedBrief } from "@/lib/managed-brief"
import { formatUsdWithInr } from "@/lib/currency"

/**
 * Who described their product to us and then did not buy.
 *
 * The order queue answers "who bought". This answers the more useful question
 * beside it: who got as far as telling us their brand, their audience and what
 * they are selling, and then stopped — because those people have already done
 * the hard part of the conversation.
 *
 * A draft is written as the brief is typed, so what is shown here is whatever
 * they had entered when they walked away, and how far through they got.
 */

type Draft = {
  id: string
  visitor_id: string
  profile_id: string | null
  person_name: string
  person_email: string
  service_key: string
  service_name: string
  package_key: string
  package_name: string
  price_inr: number
  brief: unknown
  furthest_step: number
  total_steps: number
  converted_project_id: string | null
  created_at: string
  updated_at: string
}

export default function AbandonedBriefs() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showConverted, setShowConverted] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/managed/briefs")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load unfinished briefs.")
      setDrafts(data.drafts || [])
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load unfinished briefs.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const abandoned = useMemo(() => drafts.filter((draft) => !draft.converted_project_id), [drafts])
  const shown = showConverted ? drafts : abandoned

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Unfinished briefs</h3>
          <p className="mt-1 text-sm text-white/40">
            {abandoned.length === 0
              ? "Nobody has left a brief unfinished."
              : `${abandoned.length} ${abandoned.length === 1 ? "person" : "people"} described their product and did not order.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-white/45">
            <input
              type="checkbox"
              checked={showConverted}
              onChange={(event) => setShowConverted(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#b9f42e]"
            />
            Include the ones who bought
          </label>
          <button
            type="button"
            onClick={load}
            className="flex h-8 items-center gap-1.5 rounded-md border border-white/12 px-3 text-xs font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      {loading ? (
        <div className="grid h-40 place-items-center rounded-2xl border border-white/10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-white/35">
          Nothing here yet. A brief appears once somebody types into it.
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              open={openId === draft.id}
              onToggle={() => setOpenId(openId === draft.id ? null : draft.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DraftRow({ draft, open, onToggle }: { draft: Draft; open: boolean; onToggle: () => void }) {
  const brief = parseManagedBrief(draft.brief)
  const progress = Math.round((draft.furthest_step / Math.max(draft.total_steps - 1, 1)) * 100)
  // What they were about to buy, named as plainly as the row can manage.
  const heading = brief.brandName || brief.productName || draft.person_name || "Unnamed brief"

  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-white/35" /> : <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />}

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-white">{heading}</span>
            {draft.converted_project_id && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Ordered
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/40">
            <span>{draft.service_name || "No service chosen"}</span>
            {draft.package_name && <span>· {draft.package_name} · {formatUsdWithInr(draft.price_inr)}</span>}
            <span>· {new Date(draft.updated_at).toLocaleString()}</span>
          </span>
        </span>

        {/* Where they stopped, which is the whole story of the row. */}
        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
          <span className="w-24 text-right text-[11px] font-semibold text-white/45">
            Step {draft.furthest_step + 1} of {draft.total_steps}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.08] px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {draft.person_email ? (
              <a
                href={`mailto:${draft.person_email}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 font-semibold text-primary transition hover:bg-primary/15"
              >
                <Mail className="h-3.5 w-3.5" />
                {draft.person_email}
              </a>
            ) : (
              // Sign-in happens at checkout, so a brief abandoned before it has
              // no name attached. Still worth reading: it says which step the
              // funnel loses people at, even when it cannot say who.
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 px-3 py-1.5 text-white/40">
                <UserX className="h-3.5 w-3.5" />
                Signed out — no contact details
              </span>
            )}
            {draft.person_name && <span className="text-white/45">{draft.person_name}</span>}
            <span className="text-white/25">Started {new Date(draft.created_at).toLocaleString()}</span>
          </div>

          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-black/25 p-4 text-[11px] leading-relaxed text-white/60">
            {briefDigest(brief) || "Nothing filled in yet."}
          </pre>

          {brief.attachments.length > 0 && (
            <p className="mt-2 text-[11px] text-white/35">
              {brief.attachments.length} file{brief.attachments.length === 1 ? "" : "s"} already uploaded with this brief.
            </p>
          )}
        </div>
      )}
    </li>
  )
}
