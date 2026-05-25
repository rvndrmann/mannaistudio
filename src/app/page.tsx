"use client"

import Navbar from "@/components/Navbar"
import { motion } from "framer-motion"
import { ArrowRight, Play, Zap, Award, Share2, ShieldCheck, ChevronRight, ArrowUpRight, X } from "lucide-react"
import { AnimatePresence } from "framer-motion"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { adminShowcase as mockShowcase } from "@/lib/data"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LandingPage() {
    const [adminShowcase, setAdminShowcase] = useState(mockShowcase)
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('showcase_items')
                    .select('*')
                    .order('created_at', { ascending: false })
                if (!error && data) {
                    setAdminShowcase(data.map((s: any) => ({
                        id: s.id,
                        title: s.title,
                        description: s.description,
                        thumbnail: s.thumbnail || '',
                        videoUrl: s.video_url || '',
                    })))
                }
            } catch {}
        }
        load()
    }, [])

    return (
        <main className="min-h-screen">
            <Navbar />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                {/* Animated Background Orbs */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] -z-10 animate-pulse-slow" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-[96px] -z-10 animate-pulse-slow delay-1000" />

                <div className="max-w-6xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-white/10 mb-8"
                    >
                        <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-xs font-medium text-white/80">NEW: Weekly Challenges with Paid Rewards</span>
                        <ChevronRight className="w-3 h-3 text-white/40" />
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
                    >
                        Master the Art of <br />
                        <span className="text-gradient">AI Video Creation</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        The ultimate platform to learn, create, and showcase your AI-powered videos.
                        Get certified, win rewards, and build your professional portfolio.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link href="/courses" className="btn-primary flex items-center gap-2 px-8 py-4 text-lg">
                            Start Learning Now <ArrowRight className="w-5 h-5" />
                        </Link>
                        <Link href="/services" className="px-8 py-4 text-lg font-medium text-white hover:text-primary transition-colors flex items-center gap-2">
                            Our AI Services <ShieldCheck className="w-5 h-5 text-primary" />
                        </Link>
                    </motion.div>

                    {/* Feature Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
                        {[
                            {
                                title: "Gamified Experience",
                                desc: "Earn XP, unlock level badges, and climb the leaderboard as you complete chapters.",
                                icon: Zap,
                                color: "text-amber-400"
                            },
                            {
                                title: "Official Certificates",
                                desc: "Get industry-recognized certificates upon course completion to showcase your skills.",
                                icon: Award,
                                color: "text-primary"
                            },
                            {
                                title: "Video Portfolios",
                                desc: "Upload up to 10 of your best AI videos to build a professional creator portfolio.",
                                icon: Play,
                                color: "text-cyan-400"
                            }
                        ].map((feature, i) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 + (i * 0.1) }}
                                className="glass-card p-8 text-left group"
                            >
                                <div className={cn("inline-flex p-3 rounded-xl bg-white/5 mb-6 transition-colors group-hover:bg-white/10", feature.color)}>
                                    <feature.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                <p className="text-white/60 leading-relaxed text-sm">
                                    {feature.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Admin Showcase Section */}
            <section className="py-24 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-12">
                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                            Our <span className="text-primary">Featured Work</span>
                        </h2>
                        <p className="text-white/60 max-w-xl">
                            Witness the power of AI video through our team's creative lens. High-end productions that push the boundaries of what's possible.
                        </p>
                    </div>
                    <Link href="/services" className="text-sm font-bold text-primary hover:underline flex items-center gap-2">
                        Inquire About Custom Work <ArrowUpRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {adminShowcase.map((item, i) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className="glass-card group overflow-hidden cursor-pointer"
                            onClick={() => item.videoUrl && setPlayingVideo({ url: item.videoUrl, title: item.title })}
                        >
                            <div className="relative aspect-video bg-white/5">
                                {item.thumbnail && <img
                                    src={item.thumbnail}
                                    alt={item.title}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-primary p-5 rounded-full shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                                        <Play className="w-8 h-8 fill-white" />
                                    </div>
                                </div>
                                <div className="absolute top-4 left-4">
                                    <div className="glass px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
                                        Agency Original
                                    </div>
                                </div>
                            </div>
                            <div className="p-8">
                                <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">{item.title}</h3>
                                <p className="text-white/50 leading-relaxed text-sm">
                                    {item.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Trust Bar */}
            <section className="py-12 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between items-center gap-8 opacity-40">
                    <span className="text-xl font-bold italic tracking-widest">LUMALABS</span>
                    <span className="text-xl font-bold italic tracking-widest">RUNWAY</span>
                    <span className="text-xl font-bold italic tracking-widest">HEYGEN</span>
                    <span className="text-xl font-bold italic tracking-widest">PABS</span>
                    <span className="text-xl font-bold italic tracking-widest">OPENAI</span>
                </div>
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
                                <button
                                    onClick={() => setPlayingVideo(null)}
                                    className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all"
                                >
                                    <X className="w-7 h-7" />
                                </button>
                            </div>
                            <div className="aspect-video bg-black">
                                <video
                                    src={playingVideo.url}
                                    controls
                                    autoPlay
                                    className="w-full h-full"
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
