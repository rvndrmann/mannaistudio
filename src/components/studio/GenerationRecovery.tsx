"use client"
import { useState } from "react"
type Job = { id: string; status: string; model?: string | null; type?: string; provider_job_id?: string | null; error?: string | null; created_at?: string }
export default function GenerationRecovery({ jobs, projectId, reload }: { jobs: Job[]; projectId: string; reload: (silent?: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const pending = jobs.filter(job => job.status !== "completed").slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
  if (!pending.length && !notice) return null
  async function repoll(job: Job) {
    setBusy(job.id); setNotice("")
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/generations/repoll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not check generation")
      setNotice(body.status === "completed" ? "Generation recovered and saved. Your gallery has been refreshed." : body.status === "failed" || body.status === "cancelled" ? body.error || `Provider reported ${body.status}; no detailed reason was returned.` : "The provider is still generating. No new generation was submitted.")
      await reload(true)
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not check generation") }
    finally { setBusy(null) }
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-white/10 p-3">
    <p className="text-xs font-bold">Generation status & recovery</p>
    {notice && <p role="status" className="text-xs text-sky-200">{notice}</p>}
    {pending.map(job => <div key={job.id} className="space-y-2 border-t border-white/10 pt-2">
      <p className="text-xs text-zinc-300">{job.model || job.type || "Generation"} · {job.status}</p>
      {(job.status === "failed" || job.status === "cancelled" || job.error) && <p className="break-words text-xs text-red-200">{job.error || "No detailed failure reason was recorded. Re-poll to check the provider when available."}</p>}
      <button type="button" disabled={Boolean(busy) || !job.provider_job_id} onClick={() => void repoll(job)} className="rounded-lg border border-[#b9f42e]/40 px-3 py-1.5 text-xs font-bold text-[#b9f42e] disabled:opacity-40">{busy === job.id ? "Checking provider…" : "Re-poll generation"}</button>
      {!job.provider_job_id && <p className="text-[11px] text-zinc-500">Re-poll unavailable: no retrievable provider ID was saved.</p>}
    </div>)}
    <p className="text-[11px] text-zinc-500">Re-poll checks your existing request. It does not start or charge for another generation.</p>
  </section>
}
