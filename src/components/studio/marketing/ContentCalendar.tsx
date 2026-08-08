"use client"

import { useState } from "react"
import { Calendar as CalendarIcon, List, Plus, Filter, Image as ImageIcon, Film, Video, FileText, CheckCircle2, Clock, AlertCircle, Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react"
import { ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export interface CalendarPost {
  id: string
  title: string
  caption: string
  hashtags: string[]
  cta: string
  contentType: "image" | "video" | "reel" | "carousel" | "text" | "article"
  mediaUrl?: string
  platforms: ("instagram" | "facebook" | "x" | "linkedin")[]
  status: "idea" | "generating" | "draft" | "needs_approval" | "approved" | "scheduled" | "published" | "failed"
  scheduledAt: string
  campaign?: string
}

const mockPosts: CalendarPost[] = [
  {
    id: "post-1",
    title: "AI Product Showcase Video",
    caption: "Transform your video production in 1 click with AI Director Hub! 🎬🚀 #AIVideo #VideoEditor #AIContent",
    hashtags: ["AIVideo", "VideoEditor", "AIContent"],
    cta: "Try Free Trial",
    contentType: "reel",
    mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600",
    platforms: ["instagram", "facebook"],
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    campaign: "Summer Product Launch",
  },
  {
    id: "post-2",
    title: "Presenter-Led AI Demo",
    caption: "Stop spending thousands on studio shoots. Watch how our AI presenter generates 4K videos in minutes.",
    hashtags: ["AIPresenter", "MarketingAI"],
    cta: "Watch Full Demo",
    contentType: "video",
    mediaUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600",
    platforms: ["linkedin", "x"],
    status: "approved",
    scheduledAt: new Date(Date.now() + 172800000).toISOString(),
    campaign: "B2B Outreach",
  },
  {
    id: "post-3",
    title: "Customer Testimonial Story",
    caption: "How Studio X scaled their content output by 5x using AI Director Hub.",
    hashtags: ["CaseStudy", "AIStudio"],
    cta: "Read Case Study",
    contentType: "carousel",
    mediaUrl: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=600",
    platforms: ["instagram", "linkedin"],
    status: "draft",
    scheduledAt: new Date(Date.now() + 259200000).toISOString(),
  },
]

export function ContentCalendar({ shots = [] }: { shots?: Array<{ id: string; title: string; video_url?: string | null; keyframe_image?: string | null }> }) {
  const [view, setView] = useState<"month" | "week" | "list">("month")
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [composerOpen, setComposerOpen] = useState(false)
  const [unavailableOpen, setUnavailableOpen] = useState(false)

  // Composer Form state
  const [caption, setCaption] = useState("")
  const [cta, setCta] = useState("")
  const [hashtags, setHashtags] = useState("#AIVideo #ContentCreator")
  const [selectedMedia, setSelectedMedia] = useState("")
  const [postPlatforms, setPostPlatforms] = useState<string[]>(["instagram"])

  const filteredPosts = mockPosts.filter((post) => {
    if (selectedPlatform !== "all" && !post.platforms.includes(selectedPlatform as any)) return false
    if (selectedStatus !== "all" && post.status !== selectedStatus) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e] uppercase">AI Content Autopilot</p>
          <h1 className="mt-1 text-3xl font-black text-white">Content Calendar</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-[#161817] p-1">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${view === "month" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Month
            </button>
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${view === "week" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Week
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${view === "list" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>

          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition-all shadow-lg"
          >
            <Plus className="h-4 w-4" /> Create Content
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#161817] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Platform:</span>
          {["all", "instagram", "facebook", "x", "linkedin"].map((platform) => (
            <button
              key={platform}
              onClick={() => setSelectedPlatform(platform)}
              className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition ${selectedPlatform === platform ? "bg-white/20 text-white border border-white/30" : "bg-black/30 text-zinc-400 hover:bg-white/5"}`}
            >
              {platform}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Status:</span>
          {["all", "draft", "needs_approval", "approved", "scheduled", "published"].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition ${selectedStatus === status ? "bg-[#b9f42e]/20 text-[#b9f42e] border border-[#b9f42e]/40" : "bg-black/30 text-zinc-400 hover:bg-white/5"}`}
            >
              {status.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar List View */}
      {view === "list" ? (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <div key={post.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#161817] p-5 md:flex-row md:items-center md:justify-between shadow-xl">
              <div className="flex items-center gap-4">
                {post.mediaUrl ? (
                  <img src={post.mediaUrl} alt={post.title} className="h-16 w-16 rounded-xl object-cover border border-white/10" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl bg-black/40 text-zinc-500">
                    <Film className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300 uppercase">{post.contentType}</span>
                    <span className="rounded-md bg-[#b9f42e]/10 px-2 py-0.5 text-[10px] font-bold text-[#b9f42e] capitalize">{post.status.replace("_", " ")}</span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-white">{post.title}</h3>
                  <p className="mt-0.5 text-xs text-zinc-400 line-clamp-1">{post.caption}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-6 border-t border-white/5 pt-3 md:border-t-0 md:pt-0">
                <div className="text-right">
                  <p className="text-xs font-medium text-zinc-400">Scheduled for</p>
                  <p className="text-xs font-bold text-white">{new Date(post.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button
                  onClick={() => setUnavailableOpen(true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10"
                >
                  Publish Now
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Month/Week Grid View */
        <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">August 2026</h2>
            <div className="flex items-center gap-2 text-zinc-400">
              <button className="rounded-lg p-1.5 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
              <button className="rounded-lg p-1.5 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 31 }).map((_, i) => {
              const day = i + 1
              const dayPosts = mockPosts.filter((p) => new Date(p.scheduledAt).getDate() === day)
              return (
                <div key={day} className="min-h-[100px] rounded-xl border border-white/5 bg-black/30 p-2 text-left hover:border-white/20 transition-all">
                  <span className="text-xs font-bold text-zinc-400">{day}</span>
                  {dayPosts.map((post) => (
                    <div key={post.id} className="mt-1.5 rounded-lg border border-[#b9f42e]/30 bg-[#b9f42e]/10 p-1.5 text-[10px] font-bold text-[#b9f42e] truncate">
                      🎬 {post.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Post Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-xl font-bold text-white">Create & Schedule Post</h2>
              <button onClick={() => setComposerOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Select Studio Media Asset</label>
                <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {shots.length > 0 ? shots.map((shot) => (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => setSelectedMedia(shot.video_url || shot.keyframe_image || "")}
                      className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${selectedMedia === (shot.video_url || shot.keyframe_image) ? "border-[#b9f42e]" : "border-white/10"}`}
                    >
                      <img src={shot.keyframe_image || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=300"} alt={shot.title} className="h-full w-full object-cover" />
                    </button>
                  )) : (
                    <p className="text-xs text-zinc-500 italic">No studio video shots generated yet. Generated videos will appear here automatically.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Post Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write an engaging caption for your AI video post..."
                  className="mt-1 h-28 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Hashtags</label>
                  <input
                    type="text"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Call to Action (CTA)</label>
                  <input
                    type="text"
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    placeholder="e.g. Try Free Trial"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button onClick={() => setComposerOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-400 hover:bg-white/5">Cancel</button>
              <button
                onClick={() => { setComposerOpen(false); setUnavailableOpen(true); }}
                className="rounded-xl bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26]"
              >
                Schedule & Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <FeatureUnavailableModal
        isOpen={unavailableOpen}
        onClose={() => setUnavailableOpen(false)}
        featureName="Social Media Publishing"
        description="Direct post scheduling and publishing is ready in the AI Director Hub interface but requires connecting social account API credentials."
      />
    </div>
  )
}
