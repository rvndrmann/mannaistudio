"use client"
import { useCallback, useEffect, useState } from "react"
type Job = { id: string; project_id: string; type: string; provider: string; model: string; status: string; provider_job_id: string | null; error: string | null; created_at: string }
export default function GenerationRecovery() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/generations", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setJobs(body.jobs)
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load jobs") }
  }, [])
  useEffect(() => { void load() }, [load])
  async function repoll(job: Job) {
    setBusy(job.id); setNotice("")
    try {
      const response = await fetch("/api/admin/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setNotice(`Provider checked: ${body.providerStatus || body.status}. ${body.status === "completed" ? "Result saved and attached to its original target." : "No new generation was submitted."}`)
      await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : "Re-poll failed") }
    finally { setBusy(null) }
  }
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Generation recovery</h2><button onClick={() => void load()} className="rounded-lg border border-white/20 px-4 py-2">Refresh</button></div>
    <p className="text-sm text-white/60">Latest 100 image and video jobs across all run modes. Re-poll retrieves the existing provider request and saves its output; it never starts another generation. APIs without a retrievable task ID cannot be recovered this way.</p>
    {notice && <p role="status" className="rounded-lg border border-white/20 p-3">{notice}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Created", "Model / type", "Status", "Provider ID", "Action"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{jobs.map(job => <tr key={job.id} className="border-t border-white/10"><td className="p-3">{new Date(job.created_at).toLocaleString()}<a href={`/studio/project/${job.project_id}`} className="block text-xs text-primary">Open project</a></td><td className="p-3">{job.model}<span className="block text-white/50">{job.provider} · {job.type}</span></td><td className="max-w-xs p-3">{job.status}{job.error && <p className="mt-1 text-xs text-red-300">{job.error}</p>}</td><td className="max-w-xs break-all p-3 text-xs">{job.provider_job_id || "No retrievable provider ID"}</td><td className="p-3"><button disabled={Boolean(busy) || !job.provider_job_id || job.status === "completed"} onClick={() => void repoll(job)} className="whitespace-nowrap rounded-lg border border-primary/50 px-3 py-2 disabled:opacity-40">{busy === job.id ? "Checking…" : "Re-poll provider"}</button></td></tr>)}</tbody></table></div>
  </section>
}
