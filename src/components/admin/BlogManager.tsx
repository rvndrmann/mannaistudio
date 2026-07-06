"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import {
    Plus, Save, Trash2, Eye, Send, Undo2, Loader2,
    FileText, Clock, CheckCircle2, X, Target,
} from "lucide-react"
import BlogKeywords from "@/components/admin/BlogKeywords"

type BlogMedia = {
    type: "video" | "image"
    url: string
    poster?: string
    prompt?: string
    model?: string
    caption?: string
}

type BlogPost = {
    id: string
    slug: string
    title: string
    excerpt: string
    content: string
    cover_image: string
    meta_description: string
    keywords: string
    status: string
    author: string
    media: BlogMedia[]
    scheduled_at: string | null
    published_at: string | null
    updated_at: string
}

const STATUS_GROUPS: { key: string; label: string; icon: typeof FileText; tone: string }[] = [
    { key: "pending_review", label: "Pending review", icon: Clock, tone: "text-amber-400" },
    { key: "scheduled", label: "Scheduled", icon: Clock, tone: "text-sky-400" },
    { key: "draft", label: "Drafts", icon: FileText, tone: "text-white/50" },
    { key: "published", label: "Published", icon: CheckCircle2, tone: "text-primary" },
]

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
}

function blankPost(): BlogPost {
    return {
        id: `new-${Date.now()}`,
        slug: "",
        title: "",
        excerpt: "",
        content: "",
        cover_image: "",
        meta_description: "",
        keywords: "",
        status: "draft",
        author: "AI Director Hub",
        media: [],
        scheduled_at: null,
        published_at: null,
        updated_at: new Date().toISOString(),
    }
}

export default function BlogManager() {
    const [view, setView] = useState<"posts" | "keywords">("posts")
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState<BlogPost | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState("")

    const load = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from("blog_posts")
            .select("*")
            .order("updated_at", { ascending: false })
        if (!error && data) {
            setPosts(
                data.map((r: any) => ({ ...r, media: Array.isArray(r.media) ? r.media : [] }))
            )
        }
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [])

    const startNew = () => {
        setEditing(blankPost())
        setMessage("")
    }

    const persist = async (post: BlogPost, overrides: Partial<BlogPost>): Promise<boolean> => {
        setSaving(true)
        setMessage("")
        try {
            const supabase = createClient()
            const slug = (post.slug && slugify(post.slug)) || slugify(post.title) || `post-${Date.now()}`
            const payload = {
                slug,
                title: post.title.trim(),
                excerpt: post.excerpt,
                content: post.content,
                cover_image: post.cover_image,
                meta_description: post.meta_description,
                keywords: post.keywords,
                author: post.author || "AI Director Hub",
                media: post.media,
                scheduled_at: post.scheduled_at,
                published_at: post.published_at,
                ...overrides,
            }
            if (!payload.title) {
                setMessage("Title is required.")
                setSaving(false)
                return false
            }

            const isNew = post.id.startsWith("new-")
            if (isNew) {
                const { data, error } = await supabase
                    .from("blog_posts")
                    .insert(payload)
                    .select("*")
                    .single()
                if (error) throw error
                const saved = { ...data, media: Array.isArray(data.media) ? data.media : [] }
                setPosts((prev) => [saved, ...prev])
                setEditing(saved)
            } else {
                const { data, error } = await supabase
                    .from("blog_posts")
                    .update(payload)
                    .eq("id", post.id)
                    .select("*")
                    .single()
                if (error) throw error
                const saved = { ...data, media: Array.isArray(data.media) ? data.media : [] }
                setPosts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
                setEditing(saved)
            }
            setMessage("Saved ✓")
            return true
        } catch (err: any) {
            setMessage(`Error: ${err.message || "could not save"}`)
            return false
        } finally {
            setSaving(false)
        }
    }

    const handleSave = () => editing && persist(editing, { status: editing.status })
    const handlePublish = () =>
        editing &&
        persist(editing, {
            status: "published",
            published_at: editing.published_at || new Date().toISOString(),
            scheduled_at: null,
        })
    const handleUnpublish = () => editing && persist(editing, { status: "draft" })
    const handleSchedule = () => {
        if (!editing) return
        if (!editing.scheduled_at) {
            setMessage("Pick a schedule date first.")
            return
        }
        persist(editing, { status: "scheduled" })
    }

    const handleDelete = async (post: BlogPost) => {
        if (post.id.startsWith("new-")) {
            setEditing(null)
            return
        }
        if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return
        const supabase = createClient()
        const { error } = await supabase.from("blog_posts").delete().eq("id", post.id)
        if (error) {
            setMessage(`Error: ${error.message}`)
            return
        }
        setPosts((prev) => prev.filter((p) => p.id !== post.id))
        if (editing?.id === post.id) setEditing(null)
    }

    const update = (patch: Partial<BlogPost>) =>
        setEditing((prev) => (prev ? { ...prev, ...patch } : prev))

    const updateMedia = (i: number, patch: Partial<BlogMedia>) =>
        setEditing((prev) =>
            prev ? { ...prev, media: prev.media.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) } : prev
        )
    const addMedia = () =>
        setEditing((prev) =>
            prev ? { ...prev, media: [...prev.media, { type: "video", url: "" }] } : prev
        )
    const removeMedia = (i: number) =>
        setEditing((prev) =>
            prev ? { ...prev, media: prev.media.filter((_, idx) => idx !== i) } : prev
        )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Blog</h2>
                    <p className="text-white/40 text-sm">
                        Review AI-written drafts, edit, and publish. Nothing goes live until you click Publish.
                    </p>
                </div>
                {view === "posts" && (
                    <button
                        onClick={startNew}
                        className="flex items-center gap-2 bg-primary text-black font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition"
                    >
                        <Plus className="w-4 h-4" /> New post
                    </button>
                )}
            </div>

            <div className="flex gap-2 border-b border-white/10">
                <button
                    onClick={() => setView("posts")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition",
                        view === "posts" ? "border-primary text-primary" : "border-transparent text-white/40 hover:text-white"
                    )}
                >
                    <FileText className="w-4 h-4" /> Posts
                </button>
                <button
                    onClick={() => setView("keywords")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition",
                        view === "keywords" ? "border-primary text-primary" : "border-transparent text-white/40 hover:text-white"
                    )}
                >
                    <Target className="w-4 h-4" /> Keywords
                </button>
            </div>

            {view === "keywords" ? (
                <BlogKeywords />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                {/* List */}
                <div className="space-y-5">
                    {loading ? (
                        <div className="flex items-center gap-2 text-white/40 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                        </div>
                    ) : posts.length === 0 ? (
                        <p className="text-white/30 text-sm">No posts yet.</p>
                    ) : (
                        STATUS_GROUPS.map((group) => {
                            const items = posts.filter((p) => p.status === group.key)
                            if (items.length === 0) return null
                            const Icon = group.icon
                            return (
                                <div key={group.key}>
                                    <p className={cn("text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5", group.tone)}>
                                        <Icon className="w-3.5 h-3.5" /> {group.label} ({items.length})
                                    </p>
                                    <div className="space-y-2">
                                        {items.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => { setEditing(p); setMessage("") }}
                                                className={cn(
                                                    "w-full text-left glass-card p-3 rounded-xl border-white/10 hover:border-primary/40 transition",
                                                    editing?.id === p.id && "border-primary/60"
                                                )}
                                            >
                                                <p className="font-medium text-sm line-clamp-1">{p.title || "(untitled)"}</p>
                                                <p className="text-xs text-white/30 line-clamp-1">/{p.slug}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Editor */}
                {editing ? (
                    <div className="glass-card p-6 rounded-2xl border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className={cn(
                                "text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md",
                                editing.status === "published" ? "bg-primary/20 text-primary" :
                                editing.status === "pending_review" ? "bg-amber-400/20 text-amber-300" :
                                editing.status === "scheduled" ? "bg-sky-400/20 text-sky-300" :
                                "bg-white/10 text-white/50"
                            )}>
                                {editing.status.replace("_", " ")}
                            </span>
                            <button onClick={() => setEditing(null)} className="text-white/30 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <Field label="Title">
                            <input
                                value={editing.title}
                                onChange={(e) => update({ title: e.target.value })}
                                className={inputCls}
                                placeholder="How to make AI videos…"
                            />
                        </Field>

                        <Field label="Slug (URL)" hint="Leave blank to auto-generate from title">
                            <input
                                value={editing.slug}
                                onChange={(e) => update({ slug: e.target.value })}
                                className={inputCls}
                                placeholder="how-to-make-ai-videos"
                            />
                        </Field>

                        <Field label="Excerpt" hint="Short summary shown on the blog index">
                            <textarea
                                value={editing.excerpt}
                                onChange={(e) => update({ excerpt: e.target.value })}
                                rows={2}
                                className={inputCls}
                            />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Meta description" hint="≤ 155 chars for Google">
                                <textarea
                                    value={editing.meta_description}
                                    onChange={(e) => update({ meta_description: e.target.value })}
                                    rows={2}
                                    className={inputCls}
                                />
                            </Field>
                            <Field label="Keywords" hint="comma separated">
                                <textarea
                                    value={editing.keywords}
                                    onChange={(e) => update({ keywords: e.target.value })}
                                    rows={2}
                                    className={inputCls}
                                />
                            </Field>
                        </div>

                        <Field label="Cover image URL">
                            <input
                                value={editing.cover_image}
                                onChange={(e) => update({ cover_image: e.target.value })}
                                className={inputCls}
                                placeholder="https://…"
                            />
                        </Field>

                        <Field label="Content (HTML)" hint="Use <h2>, <p>, <ul>, <a href='/courses'>… Admin-reviewed, rendered as-is.">
                            <textarea
                                value={editing.content}
                                onChange={(e) => update({ content: e.target.value })}
                                rows={14}
                                className={cn(inputCls, "font-mono text-xs leading-relaxed")}
                            />
                        </Field>

                        {/* Media examples */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-white/70">Example media (video / image)</p>
                                <button onClick={addMedia} className="text-xs flex items-center gap-1 text-primary hover:underline">
                                    <Plus className="w-3.5 h-3.5" /> Add
                                </button>
                            </div>
                            <div className="space-y-3">
                                {editing.media.map((m, i) => (
                                    <div key={i} className="border border-white/10 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={m.type}
                                                onChange={(e) => updateMedia(i, { type: e.target.value as "video" | "image" })}
                                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm"
                                            >
                                                <option value="video">video</option>
                                                <option value="image">image</option>
                                            </select>
                                            <input
                                                value={m.url}
                                                onChange={(e) => updateMedia(i, { url: e.target.value })}
                                                placeholder="media URL (Higgsfield)"
                                                className={cn(inputCls, "flex-1")}
                                            />
                                            <button onClick={() => removeMedia(i)} className="text-red-400/70 hover:text-red-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={m.poster || ""} onChange={(e) => updateMedia(i, { poster: e.target.value })} placeholder="poster URL (for video)" className={inputCls} />
                                            <input value={m.model || ""} onChange={(e) => updateMedia(i, { model: e.target.value })} placeholder="model (e.g. Seedance 2.0)" className={inputCls} />
                                        </div>
                                        <input value={m.caption || ""} onChange={(e) => updateMedia(i, { caption: e.target.value })} placeholder="caption" className={inputCls} />
                                        <textarea value={m.prompt || ""} onChange={(e) => updateMedia(i, { prompt: e.target.value })} placeholder="prompt used" rows={2} className={inputCls} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Field label="Schedule date (optional)">
                            <input
                                type="datetime-local"
                                value={editing.scheduled_at ? editing.scheduled_at.slice(0, 16) : ""}
                                onChange={(e) => update({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                className={inputCls}
                            />
                        </Field>

                        {message && (
                            <p className={cn("text-sm", message.startsWith("Error") ? "text-red-400" : "text-primary")}>{message}</p>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                            <button onClick={handleSave} disabled={saving} className={btnCls}>
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                            </button>
                            {editing.status !== "published" ? (
                                <button onClick={handlePublish} disabled={saving} className={cn(btnCls, "bg-primary text-black border-primary")}>
                                    <Send className="w-4 h-4" /> Publish now
                                </button>
                            ) : (
                                <button onClick={handleUnpublish} disabled={saving} className={btnCls}>
                                    <Undo2 className="w-4 h-4" /> Unpublish
                                </button>
                            )}
                            <button onClick={handleSchedule} disabled={saving} className={btnCls}>
                                <Clock className="w-4 h-4" /> Schedule
                            </button>
                            {!editing.id.startsWith("new-") && (
                                <a href={`/blog/${editing.slug}`} target="_blank" rel="noreferrer" className={btnCls}>
                                    <Eye className="w-4 h-4" /> Preview
                                </a>
                            )}
                            <button onClick={() => handleDelete(editing)} className={cn(btnCls, "text-red-400 border-red-400/30 ml-auto")}>
                                <Trash2 className="w-4 h-4" /> Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="glass-card p-10 rounded-2xl border-white/10 text-center text-white/30 flex items-center justify-center min-h-[300px]">
                        Select a post on the left, or create a new one.
                    </div>
                )}
            </div>
            )}
        </div>
    )
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
const btnCls = "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-white/10 hover:bg-white/5 transition disabled:opacity-50"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-white/70">{label}</span>
            {hint && <span className="text-xs text-white/30 ml-2">{hint}</span>}
            <div className="mt-1">{children}</div>
        </label>
    )
}
