"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Trash2, UserPlus, X } from "lucide-react"

type Share = { profile_id: string; full_name: string | null; email: string | null; created_at: string; role?: string }
type Member = { profile_id: string; full_name: string | null; email: string | null; role: string }

export default function ShareProjectDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [selected, setSelected] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const load = useCallback(async () => {
    try {
      const [shareResponse, teamResponse] = await Promise.all([
        fetch(`/api/studio/projects/${projectId}/share`, { cache: "no-store" }),
        fetch("/api/teams", { cache: "no-store" }),
      ])
      const shareJson = await shareResponse.json()
      const teamJson = await teamResponse.json()
      if (!shareResponse.ok) throw new Error(shareJson.error || "Could not load sharing")
      setShares(shareJson.shares)
      setIsOwner(Boolean(shareJson.isOwner))
      setMembers(teamJson.members || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sharing")
      setShares([])
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const act = async (run: () => Promise<Response>) => {
    setBusy(true)
    setError(null)
    try {
      const response = await run()
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "That did not work")
      await load()
      setSelected("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work")
    } finally {
      setBusy(false)
    }
  }

  const sharedIds = new Set((shares || []).map((share) => share.profile_id))
  const shareable = members.filter((member) => !sharedIds.has(member.profile_id) && member.role !== "owner")

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#121412] p-6 text-white" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-bold">Share this project</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Team members you add here can open this project and work on it with their own AI Director chat and their own credits.
        </p>

        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-200">{error}</p>}

        {!shares ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#b9f42e]" /></div>
        ) : (
          <>
            {isOwner && (
              <div className="mt-4 flex gap-2">
                <select
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#b9f42e]/50"
                >
                  <option value="">{shareable.length ? "Choose a team member…" : "No team members available"}</option>
                  {shareable.map((member) => (
                    <option key={member.profile_id} value={member.profile_id}>
                      {member.full_name || member.email}{member.role === "viewer" ? " — view only" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => act(() => fetch(`/api/studio/projects/${projectId}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: selected }) }))}
                  className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5" /> Share</>}
                </button>
              </div>
            )}

            {!members.length && isOwner && (
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-zinc-400">
                You have no team yet. Create one and add members before sharing projects.
              </p>
            )}

            <div className="mt-5">
              <p className="t-caption text-zinc-500">Shared with</p>
              {!shares.length ? (
                <p className="mt-2 text-xs text-zinc-500">Only you can open this project.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/10">
                  {shares.map((share) => (
                    <li key={share.profile_id} className="flex items-center justify-between px-3 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-zinc-100">
                          {share.full_name || "Creator"}
                          {members.find((member) => member.profile_id === share.profile_id)?.role === "viewer" && (
                            <span className="ml-2 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">view only</span>
                          )}
                        </p>
                        <p className="text-[11px] text-zinc-500">{share.email}</p>
                      </div>
                      {isOwner && (
                        <button
                          type="button"
                          disabled={busy}
                          title="Remove access"
                          onClick={() => act(() => fetch(`/api/studio/projects/${projectId}/share`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: share.profile_id }) }))}
                          className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
