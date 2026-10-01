"use client"
import { useEffect, useState } from "react"
import CodexSetup from "./CodexSetup"

type Connection = { id: string; name: string; scopes: string[]; created_at: string }
export default function Connections({ endpoint }: { endpoint: string }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let active = true
    fetch("/api/studio/external/connections", { cache: "no-store" }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load connections")
      if (active) setConnections(data.connections)
    }).catch((error) => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function disconnect(id: string) {
    setBusy(id); setError("")
    try {
      const response = await fetch("/api/studio/external/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not disconnect")
      setConnections((current) => current.filter((connection) => connection.id !== id))
    } catch (error) { setError(error instanceof Error ? error.message : "Could not disconnect") }
    finally { setBusy(null) }
  }
  return <div className="space-y-8">
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h2 className="text-xl font-semibold">Connect your AI assistant</h2>
      <p className="text-white/70">Add this URL as a remote MCP server in your assistant, then authenticate with your Studio account.</p>
      <div className="flex flex-wrap gap-3 items-center"><code className="break-all rounded-lg bg-black/30 p-3 text-sm">{endpoint}</code><button type="button" className="rounded-lg border border-white/20 px-4 py-2" onClick={async () => { try { await navigator.clipboard.writeText(endpoint); setCopied(true) } catch { setError("Copy the server URL manually") } }}>{copied ? "Copied" : "Copy URL"}</button></div>
      <p className="text-sm text-white/60">Ask to show your projects, create with your AI Director, or check your hired-team orders and final deliveries. Studio generation uses your credits and connected providers.</p>
      <a href="/hire-us" className="inline-block text-sm text-primary underline">Hire our creative team</a>
    </section>
    <CodexSetup endpoint={endpoint} />
    <section className="space-y-4"><h2 className="text-xl font-semibold">Connected assistants</h2>
      {loading ? <p className="text-white/60">Loading connections…</p> : !connections.length ? <p className="text-white/60">No assistants connected yet.</p> : connections.map((connection) => <div key={connection.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
        <div><p className="font-medium">{connection.name}</p><p className="mt-1 text-xs text-white/60">Connected {new Date(connection.created_at).toLocaleDateString()}</p></div>
        <button type="button" disabled={busy !== null} onClick={() => void disconnect(connection.id)} className="rounded-lg border border-red-400/30 px-4 py-2 text-sm text-red-300 disabled:opacity-50">{busy === connection.id ? "Disconnecting…" : "Disconnect"}</button>
      </div>)}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </section>
  </div>
}
