"use client"

import { useEffect, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"

type TestUser = { id: string; email: string | null }

export default function ByokTestAccessControls() {
  const [users, setUsers] = useState<TestUser[]>([])
  const [email, setEmail] = useState("")
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function load() {
    const response = await fetch("/api/admin/byok-test-access", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Could not load test accounts")
    setUsers(data.users || [])
    setReady(true)
  }

  useEffect(() => { void load().catch((error) => { setMessage(error instanceof Error ? error.message : "Could not load test accounts"); setReady(true) }) }, [])

  async function update(method: "POST" | "DELETE", body: Record<string, string>) {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/admin/byok-test-access", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not update BYOK test access")
      setEmail("")
      await load()
      setMessage(method === "POST" ? "BYOK test access granted. The account must connect its own provider key." : "BYOK test access revoked.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update BYOK test access")
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
    <div>
      <h3 className="text-lg font-semibold">BYOK test access</h3>
      <p className="mt-1 text-sm text-white/55">Allow a non-admin account to connect and test its own provider keys without a paid subscription. Test accounts are locked to their own keys and cannot fall back to platform keys or credits. Remove access when testing is complete.</p>
    </div>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void update("POST", { email }) }}>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Test account email" className="min-w-64 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm" disabled={!ready || busy} />
      <button type="submit" disabled={!ready || busy} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant BYOK test access"}</button>
    </form>
    {users.length > 0 && <ul className="space-y-2">{users.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm"><span>{user.email || user.id}</span><button type="button" disabled={busy} onClick={() => void update("DELETE", { userId: user.id })} className="inline-flex items-center gap-1 text-xs text-red-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Revoke</button></li>)}</ul>}
    {message && <p role="status" className="text-sm text-white/65">{message}</p>}
  </section>
}
