"use client"

import Navbar from "@/components/Navbar"
import { Award, BarChart3, ExternalLink, Play, Share2, User, Video, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import { fetchPublicPortfolio, getPortfolioClient, type PublicPortfolio } from "@/lib/portfolio"

const fallbackPortfolio: PublicPortfolio = {
    name: "AI Video Creator",
    email: "",
    avatarUrl: "",
    level: 1,
    xp: 0,
    slug: "",
    videos: [],
}

const decodePortfolio = (value: string | null): PublicPortfolio => {
    if (!value) return fallbackPortfolio

    try {
        const json = decodeURIComponent(escape(atob(value)))
        const portfolio = JSON.parse(json)

        return {
            ...fallbackPortfolio,
            ...portfolio,
            slug: portfolio.slug || "",
            videos: Array.isArray(portfolio.videos) ? portfolio.videos.slice(0, 10) : [],
        }
    } catch (e) {
        return fallbackPortfolio
    }
}

export default function PortfolioPage() {
    const [portfolio, setPortfolio] = useState<PublicPortfolio>(fallbackPortfolio)
    const [shareMessage, setShareMessage] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)

    useEffect(() => {
        const loadPortfolio = async () => {
            const params = new URLSearchParams(window.location.search)
            const slug = params.get("u")

            if (!slug) {
                setPortfolio(decodePortfolio(params.get("data")))
                setIsLoading(false)
                return
            }

            try {
                const supabase = await getPortfolioClient()
                if (!supabase) {
                    setPortfolio(fallbackPortfolio)
                    return
                }

                const publicPortfolio = await fetchPublicPortfolio(supabase, slug)
                setPortfolio(publicPortfolio || fallbackPortfolio)
            } finally {
                setIsLoading(false)
            }
        }

        loadPortfolio()
    }, [])

    const handleShare = async () => {
        try {
            const link = window.location.href
            await navigator.clipboard.writeText(link)
            setShareMessage("✓ Link copied!")
            setTimeout(() => setShareMessage(""), 3000)
        } catch (e) {
            setShareMessage("Could not copy link.")
            setTimeout(() => setShareMessage(""), 3000)
        }
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary to-cyan-400 p-1">
                            <div className="w-full h-full rounded-[20px] bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                                {portfolio.avatarUrl ? (
                                    <img src={portfolio.avatarUrl} alt={portfolio.name} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-12 h-12 text-white/30" />
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-4">
                                {isLoading ? "Loading Portfolio" : "Public Portfolio"}
                            </div>
                            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">{portfolio.name}</h1>
                            {portfolio.email && <p className="text-white/40 mt-2">{portfolio.email}</p>}
                            <div className="flex flex-wrap gap-3 mt-5">
                                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-bold">Level {portfolio.level}</span>
                                </div>
                                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-bold">{portfolio.xp} XP</span>
                                </div>
                                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                                    <Video className="w-4 h-4 text-cyan-300" />
                                    <span className="text-sm font-bold">{portfolio.videos.length} Works</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-start lg:items-end gap-3">
                        <button onClick={handleShare} className="btn-primary flex items-center gap-2">
                            <Share2 className="w-4 h-4" />
                            Share
                        </button>
                        {shareMessage && <p className="text-xs font-medium text-green-400 animate-pulse">{shareMessage}</p>}
                    </div>
                </div>

                {portfolio.videos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {portfolio.videos.map((video) => (
                            <article key={video.id} className="glass-card group overflow-hidden cursor-pointer" onClick={() => setPlayingVideo({ url: video.url, title: video.title })}>
                                <div className="relative aspect-video bg-black/50">
                                    {video.thumbnail ? (
                                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500" />
                                    ) : video.url ? (
                                        <video src={video.url} muted preload="metadata" className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500" />
                                    ) : null}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="p-4 rounded-full bg-primary shadow-2xl">
                                            <Play className="w-7 h-7 fill-white" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h2 className="font-bold text-lg group-hover:text-primary transition-colors">{video.title}</h2>
                                    <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                        <span>{video.views} Views</span>
                                        <span>{video.likes} Likes</span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card p-12 text-center">
                        <Video className="w-12 h-12 text-white/20 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">No Work Added Yet</h2>
                        <p className="text-white/40">This portfolio is public, but it does not have any videos yet.</p>
                    </div>
                )}
            </section>

            {/* Video Player Modal */}
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
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-5xl shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-xl font-bold">{playingVideo.title}</h3>
                                <button onClick={() => setPlayingVideo(null)} className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                                    <X className="w-7 h-7" />
                                </button>
                            </div>
                            <div className="aspect-video bg-black">
                                <video src={playingVideo.url} controls autoPlay className="w-full h-full" />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
