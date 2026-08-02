"use client"

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bot, Clapperboard, FileText, Film, Image, LayoutPanelTop, Loader2, MessageSquare, Users } from "lucide-react"

type Workspace = {
  project: { id: string; name: string; description: string | null; default_style: string; default_aspect: string }
  episodes: { id: string; name: string; description: string | null; status: string }[]
  entities: { id: string; name: string; type: string; description: string | null }[]
  shots: { id: string; title: string; description: string | null; prompt: string | null; video_url: string | null; video_status: string }[]
  chatMessages: { id: string; role: string; content: string | null; created_at: string }[]
}

const tabs = [
  { id: "canvas", label: "Canvas", icon: LayoutPanelTop },
  { id: "script", label: "Script", icon: FileText },
  { id: "characters", label: "Characters", icon: Users },
  { id: "storyboard", label: "Storyboard", icon: Image },
  { id: "timeline", label: "Timeline", icon: Film },
] as const

export default function ProjectWorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("canvas")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/studio/projects/${projectId}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not load this workspace.")
        setWorkspace(data)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load this workspace.")
      } finally { setLoading(false) }
    }
    load()
  }, [projectId])

  const content = useMemo(() => {
    if (!workspace) return null
    if (tab === "script") return <section><h2 className="text-lg font-semibold">Script</h2><p className="mt-2 text-sm text-slate-500">Build each episode’s screenplay and use it to guide your shots.</p><div className="mt-5 space-y-3">{workspace.episodes.map((episode) => <article key={episode.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-medium">{episode.name}</p><p className="mt-1 text-sm text-slate-500">{episode.description || "No script notes yet."}</p></article>)}</div></section>
    if (tab === "characters") return <section><h2 className="text-lg font-semibold">Characters, scenes & props</h2><p className="mt-2 text-sm text-slate-500">Keep recurring visual details consistent across every generation.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{workspace.entities.map((entity) => <article key={entity.id} className="rounded-xl border border-slate-200 bg-white p-4"><span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{entity.type}</span><p className="mt-1 font-medium">{entity.name}</p><p className="mt-1 text-sm text-slate-500">{entity.description || "No description yet."}</p></article>)}{workspace.entities.length === 0 && <Empty label="Add characters, scenes, and props from the assistant." />}</div></section>
    if (tab === "storyboard") return <section><h2 className="text-lg font-semibold">Storyboard</h2><p className="mt-2 text-sm text-slate-500">Arrange your planned shots visually before generating video.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{workspace.shots.map((shot) => <article key={shot.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex aspect-video items-center justify-center bg-slate-100"><Image className="h-7 w-7 text-slate-400" /></div><div className="p-4"><p className="font-medium">{shot.title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{shot.prompt || shot.description || "No prompt yet."}</p></div></article>)}{workspace.shots.length === 0 && <Empty label="Your storyboard will appear here when you add shots." />}</div></section>
    if (tab === "timeline") return <section><h2 className="text-lg font-semibold">Timeline</h2><p className="mt-2 text-sm text-slate-500">Sequence your shots into the final cut.</p><div className="mt-5 space-y-3">{workspace.shots.map((shot, index) => <article key={shot.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">{index + 1}</span><div><p className="font-medium">{shot.title}</p><p className="text-sm text-slate-500">{shot.video_status}</p></div></article>)}{workspace.shots.length === 0 && <Empty label="No shots have been added to the timeline." />}</div></section>
    return <section><h2 className="text-lg font-semibold">Creative canvas</h2><p className="mt-2 text-sm text-slate-500">Your central workspace for planning and generating this project.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><Metric label="Episodes" value={workspace.episodes.length} /><Metric label="Characters & assets" value={workspace.entities.length} /><Metric label="Shots" value={workspace.shots.length} /><Metric label="Visual style" value={workspace.project.default_style || "Cinematic"} /></div></section>
  }, [tab, workspace])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>
  if (error || !workspace) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-5 text-center text-white"><h1 className="text-2xl font-bold">Workspace unavailable</h1><p className="text-white/60">{error || "This project could not be found."}</p><Link href="/studio" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950">Back to Studio</Link></div>

  return <main className="min-h-screen bg-slate-100 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><Link href="/studio" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link><div className="min-w-0"><p className="truncate font-semibold">{workspace.project.name}</p><p className="text-xs text-slate-500">Creator Studio workspace</p></div></div><div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex"><Clapperboard className="h-4 w-4" /> {workspace.project.default_aspect || "16:9"}</div></header><div className="flex min-h-[calc(100vh-4rem)]"><aside className="w-16 border-r border-slate-200 bg-white py-4 sm:w-52"><nav className="space-y-1 px-2">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-5 w-5 shrink-0" /><span className="hidden sm:block">{label}</span></button>)}</nav></aside><section className="flex-1 p-5 sm:p-8"><div className="mx-auto max-w-4xl">{content}</div></section><aside className="hidden w-80 border-l border-slate-200 bg-white lg:block"><div className="border-b border-slate-200 p-5"><div className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-indigo-600" /> Creative assistant</div><p className="mt-1 text-xs text-slate-500">Chat tools will be available here.</p></div><div className="space-y-3 p-5">{workspace.chatMessages.slice(-4).map((message) => <div key={message.id} className={`rounded-xl p-3 text-sm ${message.role === "user" ? "bg-indigo-50 text-indigo-950" : "bg-slate-100 text-slate-700"}`}>{message.content || "Generation activity"}</div>)}{workspace.chatMessages.length === 0 && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><MessageSquare className="mb-2 h-5 w-5" />Start planning in the dashboard assistant.</div>}</div></aside></div></main>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article> }
function Empty({ label }: { label: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{label}</div> }
