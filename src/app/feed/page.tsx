"use client"

import Navbar from "@/components/Navbar"
import { AnimatePresence, motion } from "framer-motion"
import { Award, Clapperboard, ExternalLink, Eye, Heart, Loader2, MessageCircle, Play, Share2, Sparkles, User, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchPublicPortfolioFeed, type PortfolioFeedItem } from "@/lib/portfolio"

export default function FeedPage() {
    const [feedItems, setFeedItems] = useState<PortfolioFeedItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [playingVideo, setPlayingVideo] = useState<PortfolioFeedItem | null>(null)
    const [message, setMessage] = useState("")

    useEffect(() => {
        const loadFeed = async () => {
            try {
                const supabase = createClient()
                setFeedItems(await fetchPublicPortfolioFeed(supabase, 40))
            } catch {
                setMessage("Could not load creator videos yet.")
            } finally {
                setIsLoading(false)
            }
        }
        loadFeed()
    }, [])

    const handleShare = async (item: PortfolioFeedItem) => {
        const url = `${window.location.origin}/portfolio?u=${item.creator.slug}`
        try {
            await navigator.clipboard.writeText(url)
            setMessage("Profile link copied.")
            setTimeout(() => setMessage(""), 2200)
        } catch {
            setMessage("Could not copy link.")
        }
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-10">
                    <div className="space-y-4 max-w-2xl">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-xs font-bold text-primary uppercase tracking-widest"
                        >
                            <Clapperboard className="w-3.5 h-3.5" /> Creator Feed
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl md:text-5xl font-bold tracking-tight"
                        >
                            AI Video <span className="text-primary">Reels</span>
                        </motion.h1>
                        <p className="text-white/60 leading-relaxed">
                            Watch the latest public videos students add to their portfolios. Upload from your profile to appear in this feed.
                        </p>
                    </div>
                    <Link href="/profile" className="btn-primary px-6 py-3 flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4" /> Add Video
                    </Link>
                </div>

                {message && (
                    <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                        {message}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
                    <div className="space-y-8 max-w-3xl">
                        {isLoading ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-white/40">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                                Loading creator videos...
                            </div>
                        ) : feedItems.length === 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
                                <Clapperboard className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold mb-2">No Videos Yet</h2>
                                <p className="text-white/40">Public portfolio videos will appear here as creators upload them.</p>
                            </div>
                        ) : (
                            feedItems.map((item, index) => (
                                <motion.article
                                    key={item.id}
                                    initial={{ opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(index * 0.05, 0.35) }}
                                    className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                                >
                                    <div className="flex items-center justify-between gap-4 p-4 border-b border-white/5">
                                        <Link href={`/portfolio?u=${item.creator.slug}`} className="flex items-center gap-3 min-w-0">
                                            <div className="w-11 h-11 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center shrink-0">
                                                {item.creator.avatarUrl ? (
                                                    <img src={item.creator.avatarUrl} alt={item.creator.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-5 h-5 text-primary" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold truncate">{item.creator.name}</p>
                                                <p className="text-xs text-white/35">Level {item.creator.level} • {new Date(item.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </Link>
                                        <Link href={`/portfolio?u=${item.creator.slug}`} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                                            <ExternalLink className="w-4 h-4" />
                                        </Link>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPlayingVideo(item)}
                                        className="relative block w-full bg-black text-left group"
                                    >
                                        <div className="aspect-[4/5] md:aspect-video bg-white/5">
                                            {item.thumbnail ? (
                                                <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="rounded-full bg-primary p-5 shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                                                <Play className="w-8 h-8 fill-white" />
                                            </div>
                                        </div>
                                    </button>

                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <button className="flex items-center gap-2 text-white/70 hover:text-red-300 transition-colors">
                                                    <Heart className="w-5 h-5" /> <span className="text-sm">{item.likes}</span>
                                                </button>
                                                <button className="flex items-center gap-2 text-white/70 hover:text-primary transition-colors">
                                                    <MessageCircle className="w-5 h-5" /> <span className="text-sm">Comment</span>
                                                </button>
                                                <button onClick={() => handleShare(item)} className="flex items-center gap-2 text-white/70 hover:text-primary transition-colors">
                                                    <Share2 className="w-5 h-5" /> <span className="text-sm">Share</span>
                                                </button>
                                            </div>
                                            <span className="flex items-center gap-1.5 text-xs text-white/35">
                                                <Eye className="w-3.5 h-3.5" /> {item.views}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold">{item.title}</h3>
                                            <p className="text-sm text-white/45 mt-1">By {item.creator.name}</p>
                                        </div>
                                    </div>
                                </motion.article>
                            ))
                        )}
                    </div>

                    <aside className="space-y-6 lg:sticky lg:top-24">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <h3 className="text-xl font-bold mb-4">Creator Activity</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between rounded-xl bg-black/15 p-4">
                                    <div>
                                        <p className="text-sm font-bold">Public videos</p>
                                        <p className="text-xs text-white/35">Latest portfolio uploads</p>
                                    </div>
                                    <span className="text-2xl font-black">{feedItems.length}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl bg-black/15 p-4">
                                    <div>
                                        <p className="text-sm font-bold">Creators</p>
                                        <p className="text-xs text-white/35">Showing in feed</p>
                                    </div>
                                    <span className="text-2xl font-black">{new Set(feedItems.map(item => item.creator.slug)).size}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Award className="w-5 h-5 text-amber-400" /> Featured Creators
                            </h3>
                            {feedItems.length === 0 ? (
                                <p className="text-sm text-white/35">Creators will appear after uploads.</p>
                            ) : (
                                <div className="space-y-3">
                                    {Array.from(new Map(feedItems.map(item => [item.creator.slug, item.creator])).values()).slice(0, 6).map((creator) => (
                                        <Link key={creator.slug} href={`/portfolio?u=${creator.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-colors">
                                            <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center">
                                                {creator.avatarUrl ? <img src={creator.avatarUrl} alt={creator.name} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-primary" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{creator.name}</p>
                                                <p className="text-xs text-white/35">Level {creator.level}</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </section>

            <AnimatePresence>
                {playingVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-xl"
                        onClick={() => setPlayingVideo(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-5xl shadow-2xl"
                            onClick={event => event.stopPropagation()}
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">{playingVideo.title}</h3>
                                    <p className="text-xs text-white/40 mt-1">{playingVideo.creator.name}</p>
                                </div>
                                <button onClick={() => setPlayingVideo(null)} className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                                    <X className="w-7 h-7" />
                                </button>
                            </div>
                            <div className="aspect-video bg-black">
                                <video
                                    key={playingVideo.url}
                                    src={playingVideo.url}
                                    controls
                                    autoPlay
                                    playsInline
                                    preload="auto"
                                    className="w-full h-full"
                                    onCanPlay={(event) => { (event.target as HTMLVideoElement).play().catch(() => {}) }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
