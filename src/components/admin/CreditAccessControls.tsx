"use client"
import { useEffect, useState } from "react"

export default function CreditAccessControls() {
  const [enabled, setEnabled] = useState(false)
  const [users, setUsers] = useState("")
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  useEffect(() => { fetch("/api/admin/credit-access").then(async r => {
    const data = await r.json(); if (!r.ok) throw new Error(data.error)
    setEnabled(data.enabled === true); setUsers((data.userIds || []).join("\n")); setReady(true)
  }).catch(e => setMessage(e.message)) }, [])
  async function save() {
    setBusy(true)
    try {
      const response = await fetch("/api/admin/credit-access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, userIds: users.split(/[\s,]+/).filter(Boolean) }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error)
      setMessage("Saved. Users see the change when they refresh.")
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save") }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-white/10 p-6 space-y-4">
    <h3 className="text-xl font-semibold">Platform credits</h3>
    <p className="text-sm text-white/60">Off by default. Users use their own subscribed API accounts. Enable balances, purchases, and platform credit usage for everyone, or only the users listed below. All Access remains BYOK-only.</p>
    <label className="flex gap-3"><input type="checkbox" checked={enabled} disabled={!ready || busy} onChange={e => setEnabled(e.target.checked)} />Enable platform credits for everyone</label>
    <label className="block">Selected user IDs (one UUID per line)<textarea className="mt-2 w-full rounded-lg bg-black/30 border border-white/20 p-3" value={users} disabled={!ready || busy} onChange={e => setUsers(e.target.value)} rows={4} /></label>
    <p className="text-xs text-white/50">These users retain access while the global switch is off. Remove an ID to revoke access. Existing purchase eligibility still applies.</p>
    <button disabled={!ready || busy} onClick={save} className="rounded-lg bg-primary text-black px-4 py-2 disabled:opacity-40">{busy ? "Saving…" : "Save credit access"}</button>
    <p role="status" className="text-sm">{message}</p>
  </section>
}
