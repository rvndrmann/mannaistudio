"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Crown, Loader2, ShieldCheck, Users, X } from "lucide-react"

type ActivityRow = {
  id: number
  created_at: string
  actor_role: string
  actor_name: string | null
  actor_email: string | null
  event_type: string
  entity_type: string
  details: { label?: string; operation?: string } | null
}

const roleLabels: Record<string, string> = {
  owner: "Project owner",
  enterprise_team: "AI Director Hub team",
  collaborator: "Team member",
  system: "System",
  unknown: "Unknown",
}

const roleIcons: Record<string, typeof Crown> = {
  owner: Crown,
  enterprise_team: ShieldCheck,
  collaborator: Users,
}

const operationVerbs: Record<string, string> = {
  insert: "created",
  update: "edited",
  delete: "deleted",
}

const entityNouns: Record<string, string> = {
  creator_shots: "storyboard shot",
  creator_entities: "asset",
  creator_episodes: "script",
}

function describe(row: ActivityRow) {
  const verb = operationVerbs[row.details?.operation || ""] || row.details?.operation || "changed"
  const noun = entityNouns[row.entity_type] || row.entity_type.replace("creator_", "").replaceAll("_", " ")
  const label = row.details?.label
  return label ? `${verb} ${noun} “${label}”` : `${verb} ${noun}`
}

export default function ProjectActivityDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [activity, setActivity] = useState<ActivityRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<"all" | "owner" | "enterprise_team">("all")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/studio/projects/${projectId}/activity`, { cache: "no-store" })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || "Could not load project activity")
        if (!cancelled) setActivity(json.activity)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load project activity")
          setActivity([])
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projectId])

  if (!mounted) return null

  const rows = (activity || []).filter((row) => filter === "all" || row.actor_role === filter)
  const hasTeamWork = (activity || []).some((row) => row.actor_role === "enterprise_team")

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#121412] p-6 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-bold">Project activity</h3>
        <p className="mt-1 max-w-lg text-xs leading-5 text-zinc-400">
          Every change to the script, storyboard, and assets, and who made it.
        </p>

        {hasTeamWork && (
          <div className="mt-4 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
            {([["all", "Everyone"], ["owner", "Client"], ["enterprise_team", "Our team"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                  filter === value ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-200">{error}</p>}

        {!activity ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#b9f42e]" /></div>
        ) : !rows.length ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-zinc-500">
            No recorded changes yet. Edits to the script, storyboard, and assets appear here as they happen.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/10">
            {rows.map((row) => {
              const RoleIcon = roleIcons[row.actor_role] || Users
              const isTeam = row.actor_role === "enterprise_team"
              return (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${isTeam ? "bg-[#b9f42e]/15 text-[#b9f42e]" : "bg-white/[0.06] text-zinc-400"}`}>
                    <RoleIcon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-200">
                      <strong className="font-semibold">{row.actor_name || row.actor_email || "Someone"}</strong> {describe(row)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      <span className={isTeam ? "text-[#b9f42e]/80" : ""}>{roleLabels[row.actor_role] || row.actor_role}</span>
                      {" · "}
                      {new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
