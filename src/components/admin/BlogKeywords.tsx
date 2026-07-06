"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Plus, Loader2, Trash2, Target, CheckCircle2, RotateCcw } from "lucide-react"

type BlogTopic = {
    id: string
    keyword: string
    target_url: string
    cluster: string
    status: string
    created_at: string
}

export default function BlogKeywords() {
    const [topics, setTopics] = useState<BlogTopic[]>([])
    const [loading, setLoading] = useState(true)
    const [newKeyword, setNewKeyword] = useState("")
    const [newTarget, setNewTarget] = useState("/courses")
    const [newCluster, setNewCluster] = useState("")
    const [adding, setAdding] = useState(false)
    const [message, setMessage] = useState("")

    const load = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from("blog_topics")
            .select("*")
            .order("status", { ascending: true })
            .order("created_at", { ascending: true })
        if (!error && data) setTopics(data)
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [])

    const addKeyword = async () => {
        const keyword = newKeyword.trim()
        if (!keyword) return
        setAdding(true)
        setMessage("")
        const supabase = createClient()
        const { data, error } = await supabase
            .from("blog_topics")
            .insert({
                keyword,
                target_url: newTarget.trim() || "/courses",
                cluster: newCluster.trim(),
            })
            .select("*")
            .single()
        setAdding(false)
        if (error) {
            setMessage(`Error: ${error.message}`)
            return
        }
        setTopics((prev) => [...prev, data])
        setNewKeyword("")
        setNewCluster("")
    }

    const toggleUsed = async (topic: BlogTopic) => {
        const nextStatus = topic.status === "used" ? "todo" : "used"
        const supabase = createClient()
        const { error } = await supabase
            .from("blog_topics")
            .update({ status: nextStatus })
            .eq("id", topic.id)
        if (error) {
            setMessage(`Error: ${error.message}`)
            return
        }
        setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, status: nextStatus } : t)))
    }

    const removeKeyword = async (topic: BlogTopic) => {
        if (!confirm(`Remove "${topic.keyword}" from the target list?`)) return
        const supabase = createClient()
        const { error } = await supabase.from("blog_topics").delete().eq("id", topic.id)
        if (error) {
            setMessage(`Error: ${error.message}`)
            return
        }
        setTopics((prev) => prev.filter((t) => t.id !== topic.id))
    }

    const todoCount = topics.filter((t) => t.status === "todo").length
    const usedCount = topics.filter((t) => t.status === "used").length

    const clusters = Array.from(new Set(topics.map((t) => t.cluster || "uncategorized")))

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" /> Keywords we&apos;re targeting
                </h2>
                <p className="text-white/40 text-sm">
                    This is the SEO backlog the blog writer pulls from, one per scheduled run.
                    {" "}<span className="text-primary">{todoCount} queued</span> · <span className="text-white/50">{usedCount} already written</span>
                </p>
            </div>

            {/* Add new keyword */}
            <div className="glass-card p-4 rounded-2xl border-white/10 flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-white/40">Keyword</label>
                    <input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                        placeholder="e.g. AI video course for beginners"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                </div>
                <div className="w-40">
                    <label className="text-xs text-white/40">Target page</label>
                    <input
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                </div>
                <div className="w-36">
                    <label className="text-xs text-white/40">Cluster</label>
                    <input
                        value={newCluster}
                        onChange={(e) => setNewCluster(e.target.value)}
                        placeholder="e.g. how-to"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                </div>
                <button
                    onClick={addKeyword}
                    disabled={adding || !newKeyword.trim()}
                    className="flex items-center gap-2 bg-primary text-black font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
            </div>

            {message && <p className="text-sm text-red-400">{message}</p>}

            {loading ? (
                <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
            ) : topics.length === 0 ? (
                <p className="text-white/30 text-sm">No keywords yet — add one above.</p>
            ) : (
                clusters.map((cluster) => {
                    const items = topics.filter((t) => (t.cluster || "uncategorized") === cluster)
                    return (
                        <div key={cluster}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2">
                                {cluster} ({items.length})
                            </p>
                            <div className="glass-card rounded-2xl border-white/10 divide-y divide-white/5">
                                {items.map((t) => (
                                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                                        <button
                                            onClick={() => toggleUsed(t)}
                                            title={t.status === "used" ? "Mark as not yet written" : "Mark as written"}
                                            className={cn(
                                                "shrink-0",
                                                t.status === "used" ? "text-primary" : "text-white/20 hover:text-white/50"
                                            )}
                                        >
                                            {t.status === "used" ? (
                                                <CheckCircle2 className="w-5 h-5" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full border-2 border-current" />
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-sm font-medium truncate", t.status === "used" && "line-through text-white/40")}>
                                                {t.keyword}
                                            </p>
                                            <p className="text-xs text-white/30">→ {t.target_url}</p>
                                        </div>
                                        <span
                                            className={cn(
                                                "text-xs px-2 py-1 rounded-md font-medium shrink-0",
                                                t.status === "used" ? "bg-white/10 text-white/40" : "bg-primary/15 text-primary"
                                            )}
                                        >
                                            {t.status === "used" ? "written" : "targeted"}
                                        </span>
                                        {t.status === "used" && (
                                            <button onClick={() => toggleUsed(t)} title="Requeue" className="text-white/20 hover:text-white/50 shrink-0">
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => removeKeyword(t)} className="text-red-400/50 hover:text-red-400 shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })
            )}
        </div>
    )
}
