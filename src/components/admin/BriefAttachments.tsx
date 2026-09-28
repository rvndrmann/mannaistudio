"use client"

import { useCallback, useEffect, useState } from "react"
import { ExternalLink, FileText, Loader2, RefreshCcw } from "lucide-react"

type Attachment = { name: string; contentType: string; kind: string; url: string | null; error: string | null }

export default function BriefAttachments({ draftId, projectId }: { draftId?: string; projectId?: string }) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const retry = useCallback(() => setRefresh((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const query = draftId ? `draftId=${encodeURIComponent(draftId)}` : `projectId=${encodeURIComponent(projectId || "")}`
    void fetch(`/api/admin/managed/brief-attachments?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Could not load attached files.")
        if (!controller.signal.aborted) setFiles(result.files || [])
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load attached files.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [draftId, projectId, refresh])

  return <section className="mt-4" aria-label="Brief attachments">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-white">Attached files</h4>
      <button type="button" onClick={retry} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-primary disabled:opacity-50"><RefreshCcw className="h-3 w-3"/>Refresh files</button>
    </div>
    {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin"/>Loading files…</p> : error ? <p role="alert" className="mt-3 text-xs text-red-300">{error}</p> : files.length === 0 ? <p className="mt-3 text-xs text-white/50">No files attached.</p> : <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {files.map((file, index) => <li key={`${file.name}-${index}`} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
        {file.url && file.contentType.startsWith("image/") && <a href={file.url} target="_blank" rel="noopener noreferrer" className="block"><img src={file.url} alt={file.name} loading="lazy" className="h-40 w-full bg-black/30 object-contain"/></a>}
        {file.url && file.contentType.startsWith("video/") && <video src={file.url} controls preload="metadata" playsInline className="h-40 w-full bg-black/30" aria-label={file.name}/>}
        <div className="p-3"><p className="break-words text-sm text-white/80">{file.name}</p><p className="mt-1 text-xs text-white/40">{file.kind.replaceAll("_", " ")}</p>
          {file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><ExternalLink className="h-3.5 w-3.5"/>Open file</a> : <p className="mt-2 flex items-center gap-2 text-xs text-amber-300"><FileText className="h-4 w-4 shrink-0"/>{file.error || "File unavailable."}</p>}
        </div>
      </li>)}
    </ul>}
  </section>
}
