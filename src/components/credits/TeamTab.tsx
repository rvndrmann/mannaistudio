"use client"

import { useCallback, useEffect, useState } from "react"
import { Crown, Eye, Loader2, Pencil, Shield, Trash2, UserPlus, Users, Zap } from "lucide-react"
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events"

type TeamMember = {
  profile_id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  role: string
  credits_balance: number
  joined_at: string
}

type TeamState = {
  team: { id: string; name: string; owner_id: string; created_at: string; credits_balance: number } | null
  members: TeamMember[]
  role: string | null
  userId: string
}

const roleIcons: Record<string, typeof Crown> = { owner: Crown, admin: Shield, member: Users, viewer: Eye }

export default function TeamTab() {
  const [state, setState] = useState<TeamState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [allocateFor, setAllocateFor] = useState<TeamMember | null>(null)
  const [allocateAmount, setAllocateAmount] = useState("")
  const [allocateMode, setAllocateMode] = useState<"allocate" | "reclaim">("allocate")
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState("")
  const [transferMode, setTransferMode] = useState<"in" | "out">("in")

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/teams", { cache: "no-store" })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Could not load team")
      setState(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (run: () => Promise<Response>) => {
    setBusy(true)
    setError(null)
    try {
      const response = await run()
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "That did not work")
      await load()
      return json
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work")
      return null
    } finally {
      setBusy(false)
    }
  }

  const createTeam = async () => {
    if (!teamName.trim()) return
    await act(() => fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: teamName.trim() }) }))
    setTeamName("")
  }

  const addMember = async () => {
    if (!inviteEmail.trim()) return
    const result = await act(() => fetch("/api/teams/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) }))
    if (result) {
      setInviteEmail("")
      setInviteRole("member")
      setInviteOpen(false)
    }
  }

  const changeRole = async (profileId: string, role: string) => {
    await act(() => fetch("/api/teams/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, role }) }))
  }

  const removeMember = async (profileId: string) => {
    await act(() => fetch("/api/teams/members", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId }) }))
  }

  const disband = async () => {
    await act(() => fetch("/api/teams", { method: "DELETE" }))
  }

  const renameTeam = async () => {
    if (!renameValue.trim()) return
    const result = await act(() => fetch("/api/teams", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }) }))
    if (result) setRenaming(false)
  }

  const submitAllocation = async () => {
    if (!allocateFor) return
    const parsed = Number(allocateAmount)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Enter a whole credit amount greater than zero")
      return
    }
    const result = await act(() => fetch("/api/teams/allocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: allocateFor.profile_id, amount: allocateMode === "allocate" ? parsed : -parsed }),
    }))
    if (result) {
      // Reclaiming from yourself is impossible, but an allocation to your own
      // row is, so refresh the badge from the server rather than guessing.
      notifyCreditBalanceChanged()
      setAllocateFor(null)
      setAllocateAmount("")
      setAllocateMode("allocate")
    }
  }

  const submitTransfer = async () => {
    const parsed = Number(transferAmount)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Enter a whole credit amount greater than zero")
      return
    }
    const result = await act(() => fetch("/api/teams/allocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: transferMode === "in" ? parsed : -parsed }),
    }))
    if (result) {
      // Transfers always move the caller's own balance.
      notifyCreditBalanceChanged(typeof result.personalBalance === "number" ? result.personalBalance : undefined)
      setTransferOpen(false)
      setTransferAmount("")
    }
  }

  if (!state) return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#b9f42e]" /></div>

  const canManage = state.role === "owner" || state.role === "admin"
  const isOwner = state.role === "owner"

  if (!state.team) {
    return (
      <div className="space-y-4">
        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <Users className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-3 text-sm font-semibold text-zinc-200">You are not on a team yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
            Create a team to add members by email and share your credits with them. Each account can belong to one team.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Team name"
              className="w-48 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#b9f42e]/50"
            />
            <button type="button" onClick={createTeam} disabled={busy || !teamName.trim()} className="rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Team"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void renameTeam() }}
                autoFocus
                className="w-52 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-[#b9f42e]/50"
              />
              <button type="button" onClick={renameTeam} disabled={busy || !renameValue.trim()} className="rounded-lg bg-[#b9f42e] px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-50">Save</button>
              <button type="button" onClick={() => setRenaming(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-300">Cancel</button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-bold text-white">
              {state.team.name}
              {isOwner && <Crown className="h-3.5 w-3.5 text-[#b9f42e]" />}
              {canManage && (
                <button type="button" onClick={() => { setRenameValue(state.team?.name || ""); setRenaming(true) }} title="Rename team" className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          )}
          <p className="text-[11px] text-zinc-500">{state.members.length} member{state.members.length === 1 ? "" : "s"} · your role: {state.role}</p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setInviteOpen((open) => !open)} className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2 text-xs font-bold text-black">
            <UserPlus className="h-3.5 w-3.5" /> Add Member
          </button>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Zap className="h-3.5 w-3.5 fill-[#b9f42e] text-[#b9f42e]" /> Team credit pool</p>
            <p className="mt-1 text-[11px] text-zinc-500">Move your credits into the pool, then allocate them to members.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-[#b9f42e]">{(state.team.credits_balance ?? 0).toLocaleString()}</span>
            {canManage && (
              <button type="button" onClick={() => setTransferOpen((open) => !open)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-[#b9f42e]/40 hover:text-[#b9f42e]">
                Transfer
              </button>
            )}
          </div>
        </div>
        {transferOpen && canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <button type="button" onClick={() => setTransferMode("in")} className={`px-3 py-2 text-[11px] font-semibold ${transferMode === "in" ? "bg-[#b9f42e] text-black" : "text-zinc-300"}`}>Transfer In</button>
              <button type="button" onClick={() => setTransferMode("out")} className={`px-3 py-2 text-[11px] font-semibold ${transferMode === "out" ? "bg-[#b9f42e] text-black" : "text-zinc-300"}`}>Transfer Out</button>
            </div>
            <input
              value={transferAmount}
              onChange={(event) => setTransferAmount(event.target.value)}
              inputMode="numeric"
              placeholder="Amount"
              className="w-32 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#b9f42e]/50"
            />
            <button type="button" onClick={submitTransfer} disabled={busy} className="rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
            </button>
            <p className="w-full text-[11px] text-zinc-500">
              {transferMode === "in" ? "Moves credits from your personal balance into the team pool." : "Moves credits from the team pool back to your personal balance."}
            </p>
          </div>
        )}
      </div>

      {inviteOpen && canManage && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-zinc-200">Add a registered member</p>
          <p className="mt-1 text-[11px] text-zinc-500">They must already have an AI Director Hub account. Ask them to sign in once, then add their email here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="member@example.com"
              className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#b9f42e]/50"
            />
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none">
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="button" onClick={addMember} disabled={busy} className="rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-white/[0.04] text-[11px] text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Credits</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {state.members.map((member) => {
              const RoleIcon = roleIcons[member.role] || Users
              const isSelf = member.profile_id === state.userId
              return (
                <tr key={member.profile_id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-zinc-100">{member.full_name || "Creator"}{isSelf && <span className="ml-1.5 text-[10px] text-zinc-500">(you)</span>}</p>
                    <p className="text-[11px] text-zinc-500">{member.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && member.role !== "owner" && !isSelf ? (
                      <select
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => changeRole(member.profile_id, event.target.value)}
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white outline-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-zinc-300"><RoleIcon className="h-3 w-3" />{member.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#b9f42e]"><Zap className="h-3 w-3 fill-[#b9f42e]" />{member.credits_balance.toLocaleString()}</span>
                    {canManage && !isSelf && (
                      <button type="button" onClick={() => { setAllocateFor(member); setAllocateAmount(""); setAllocateMode("allocate") }} className="ml-2 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-[#b9f42e]/40 hover:text-[#b9f42e]">
                        Allocate
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{new Date(member.joined_at).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {member.role !== "owner" && (
                        <button type="button" disabled={busy} onClick={() => removeMember(member.profile_id)} title="Remove member" className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {allocateFor && (
        <div className="rounded-xl border border-[#b9f42e]/25 bg-[#b9f42e]/[0.06] p-4">
          <p className="text-xs font-semibold text-zinc-100">Manage credits for {allocateFor.full_name || allocateFor.email}</p>
          <p className="mt-1 text-[11px] text-zinc-400">Allocate moves credits from the team pool to this member. Reclaim moves them back into the pool.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <button type="button" onClick={() => setAllocateMode("allocate")} className={`px-3 py-2 text-[11px] font-semibold ${allocateMode === "allocate" ? "bg-[#b9f42e] text-black" : "text-zinc-300"}`}>Allocate</button>
              <button type="button" onClick={() => setAllocateMode("reclaim")} className={`px-3 py-2 text-[11px] font-semibold ${allocateMode === "reclaim" ? "bg-[#b9f42e] text-black" : "text-zinc-300"}`}>Reclaim</button>
            </div>
            <input
              value={allocateAmount}
              onChange={(event) => setAllocateAmount(event.target.value)}
              inputMode="numeric"
              placeholder="Amount"
              className="w-32 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#b9f42e]/50"
            />
            <button type="button" onClick={submitAllocation} disabled={busy} className="rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
            </button>
            <button type="button" onClick={() => setAllocateFor(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-3">
        {isOwner ? (
          <button type="button" disabled={busy} onClick={disband} className="rounded-lg border border-red-500/30 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            Disband Team
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => removeMember(state.userId)} className="rounded-lg border border-red-500/30 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            Leave Team
          </button>
        )}
      </div>
    </div>
  )
}
