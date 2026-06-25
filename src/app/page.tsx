"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { motion } from "framer-motion"
import { ArrowRight, Play, Zap, Trophy, Briefcase, Clapperboard, PenLine, Wand2, Film, ShieldCheck, ChevronRight, ArrowUpRight, X } from "lucide-react"
import { AnimatePresence } from "framer-motion"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { adminShowcase as mockShowcase } from "@/lib/data"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import { defaultBillingSettings, fetchBillingSettings, getActivePlanPrice, membershipPlan } from "@/lib/membership"
import { CheckCircle2 } from "lucide-react"

export default function LandingPage() {
    const { user, signInWithGoogle } = useAuth()
    const [adminShowcase, setAdminShowcase] = useState(mockShowcase)
    const [courses, setCourses] = useState<any[]>([])
    const [billingSettings, setBillingSettings] = useState(defaultBillingSettings)
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const [showcaseRes, coursesRes] = await Promise.all([
                    supabase
                        .from('showcase_items')
                        .select('*')
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('courses')
                        .select('*')
                        .order('created_at', { ascending: true })
                        .limit(3),
                ])
                if (!showcaseRes.error && showcaseRes.data) {
                    setAdminShowcase(showcaseRes.data.map((s: any) => ({
                        id: s.id,
                        title: s.title,
                        description: s.description,
                        thumbnail: s.thumbnail || '',
                        videoUrl: s.video_url || '',
                    })))
                }
                if (!coursesRes.error && coursesRes.data) {
                    setCourses(coursesRes.data)
                }
                setBillingSettings(await fetchBillingSettings(supabase))
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
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-lime-400/10 rounded-full blur-[96px] -z-10 animate-pulse-slow delay-1000" />

                <div className="max-w-6xl mx-auto text-center">
                    <motion.img
                        src="/logo.png"
                        alt="AI Director Hub"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-28 h-28 md:w-32 md:h-32 rounded-full mx-auto mb-8 shadow-[0_0_60px_-15px] shadow-primary/50"
                    />
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
                        Become an <br />
                        <span className="text-gradient">AI Director</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        AI Director Hub sells AI courses, digital products, and professional AI services
                        including AI video creation, scriptwriting, and post-production.
                        Learn the complete AI filmmaking workflow with project-based courses, practice
                        in weekly challenges with paid rewards, and turn your skills into income through AI jobs.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        {user ? (
                            <Link href="/courses" className="btn-primary flex items-center gap-2 px-8 py-4 text-lg">
                                Start Learning Now <ArrowRight className="w-5 h-5" />
                            </Link>
                        ) : (
                            <button onClick={signInWithGoogle} className="btn-primary flex items-center gap-2 px-8 py-4 text-lg">
                                Start Learning Now <ArrowRight className="w-5 h-5" />
                            </button>
                        )}
                        <Link href="/services" className="px-8 py-4 text-lg font-medium text-white hover:text-primary transition-colors flex items-center gap-2">
                            AI Jobs <ShieldCheck className="w-5 h-5 text-primary" />
                        </Link>
                    </motion.div>

                    {/* Feature Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
                        {[
                            {
                                title: "Project-Based Courses",
                                desc: "Step-by-step video courses where you build real AI films — scriptwriting agents, prompt engineering, character & scene generation, and editing. Every chapter comes with prompt docs and downloadable resources.",
                                icon: Clapperboard,
                                color: "text-primary"
                            },
                            {
                                title: "Weekly Challenges & Rewards",
                                desc: "Put your skills to the test in weekly creation challenges with paid prizes. Earn XP, level up, and climb the leaderboard as you complete chapters.",
                                icon: Trophy,
                                color: "text-amber-400"
                            },
                            {
                                title: "Portfolio & AI Jobs",
                                desc: "Upload your best AI videos to a shareable creator portfolio, then land paid work through our AI jobs marketplace built for AI video creators.",
                                icon: Briefcase,
                                color: "text-lime-300"
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

            {/* Featured Showcase Section (moved to top) */}
            <section className="py-16 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-12">
                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                            Our <span className="text-primary">Featured Course</span>
                        </h2>
                        <p className="text-white/60 max-w-xl">
                            Witness the power of AI video through our team's creative lens. High-end productions that push the boundaries of what's possible.
                        </p>
                    </div>
                    <Link href="/services" className="text-sm font-bold text-primary hover:underline flex items-center gap-2">
                        Browse AI Jobs <ArrowUpRight className="w-4 h-4" />
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
                                {item.thumbnail ? (
                                    <img
                                        src={item.thumbnail}
                                        alt={item.title}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                ) : item.videoUrl ? (
                                    <video
                                        src={`${item.videoUrl}#t=0.1`}
                                        muted
                                        preload="metadata"
                                        playsInline
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                ) : null}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-primary p-5 rounded-full shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                                        <Play className="w-8 h-8 fill-black" />
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

            {/* What You'll Learn Section */}
            <section className="py-24 px-6 max-w-7xl mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                        Learn the Complete <span className="text-primary">AI Filmmaking Workflow</span>
                    </h2>
                    <p className="text-white/60 max-w-2xl mx-auto">
                        No film school. No expensive gear. Just you, AI tools, and a proven step-by-step
                        process — the same workflow we use to produce our own agency films.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        {
                            step: "01",
                            title: "Write with AI Agents",
                            desc: "Turn ideas into shoot-ready scripts using AI scriptwriter agents and master prompts that structure your story scene by scene.",
                            icon: PenLine,
                        },
                        {
                            step: "02",
                            title: "Master Prompt Engineering",
                            desc: "Learn the exact prompting techniques for tools like Seedance to control camera, lighting, mood, and motion in every shot.",
                            icon: Wand2,
                        },
                        {
                            step: "03",
                            title: "Generate Characters & Scenes",
                            desc: "Build consistent characters, environments, and assets across an entire film so your story looks like one production, not random clips.",
                            icon: Clapperboard,
                        },
                        {
                            step: "04",
                            title: "Edit & Publish",
                            desc: "Assemble your generated shots into a finished film — pacing, sound, and final polish — then publish it to your portfolio.",
                            icon: Film,
                        },
                    ].map((item, i) => (
                        <motion.div
                            key={item.step}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className="glass-card p-8 relative overflow-hidden group"
                        >
                            <span className="absolute -top-2 -right-2 text-7xl font-black text-white/5 group-hover:text-primary/10 transition-colors">{item.step}</span>
                            <div className="inline-flex p-3 rounded-xl bg-primary/10 text-primary mb-6">
                                <item.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold mb-3">{item.title}</h3>
                            <p className="text-white/60 leading-relaxed text-sm">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Featured Courses Section */}
            {courses.length > 0 && (
            <section className="py-24 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-12">
                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                            Explore <span className="text-primary">Courses</span>
                        </h2>
                        <p className="text-white/60 max-w-xl">
                            Project-based AI video courses with clear, fixed pricing. Learn at your own pace with downloadable resources.
                        </p>
                    </div>
                    <Link href="/courses" className="text-sm font-bold text-primary hover:underline flex items-center gap-2">
                        View All Courses <ArrowUpRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {courses.map((course, i) => {
                        const isFree = course.price === "Free" || course.price === "$0" || course.price === 0 || course.price === "0" || !course.price
                        return (
                        <motion.div
                            key={course.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className="glass-card group overflow-hidden flex flex-col"
                        >
                            <Link href={`/courses/${course.id}`} className="relative aspect-video bg-white/5 block overflow-hidden">
                                {course.thumbnail && (
                                    <img
                                        src={course.thumbnail}
                                        alt={course.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                )}
                                <div className="absolute top-3 right-3 px-3 py-1 glass rounded-full text-[10px] font-bold tracking-widest uppercase">
                                    {course.level}
                                </div>
                            </Link>
                            <div className="p-6 flex flex-col flex-grow">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                                        <Zap className="w-3.5 h-3.5" /> +{course.xp} XP
                                    </span>
                                    <span className="text-white/20">|</span>
                                    <span className="text-xs text-white/50">{course.chapters} Chapters</span>
                                </div>
                                <Link href={`/courses/${course.id}`}>
                                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors line-clamp-1">{course.title}</h3>
                                </Link>
                                <p className="text-white/50 text-sm mt-2 mb-6 line-clamp-2 leading-relaxed">{course.description}</p>
                                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-lg font-bold text-emerald-400">
                                        {isFree ? "Free" : isNaN(Number(course.price)) ? course.price : `₹${course.price}`}
                                    </span>
                                    <Link href={`/courses/${course.id}`} className="text-sm font-medium text-white hover:text-primary transition-colors flex items-center gap-1.5">
                                        Enroll Now <Play className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    )})}
                </div>
            </section>
            )}

            {/* Membership Pricing Section */}
            <section className="py-24 px-6 max-w-3xl mx-auto">
                <div className="text-center mb-10 space-y-3">
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                        Simple <span className="text-primary">Pricing</span>
                    </h2>
                    <p className="text-white/60">One membership unlocks all premium courses and creator tools.</p>
                </div>

                <div className="glass-card rounded-3xl border-white/10 p-8 md:p-10 max-w-md mx-auto text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 blur-[80px] rounded-full -z-10" />
                    <h3 className="text-xl font-bold">{billingSettings.planName}</h3>
                    <p className="text-sm text-white/40 mt-1">Monthly membership</p>

                    <div className="my-6">
                        {billingSettings.offerEnabled && (
                            <div className="mb-2 text-sm font-bold text-emerald-300">{billingSettings.offerText}</div>
                        )}
                        {billingSettings.offerEnabled && (
                            <span className="mr-3 text-2xl font-bold text-white/30 line-through">₹{billingSettings.monthlyPrice}</span>
                        )}
                        <span className="text-5xl font-bold">₹{getActivePlanPrice(billingSettings)}</span>
                        <span className="text-white/40"> / month</span>
                    </div>

                    <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
                        {[
                            "Access to all premium courses",
                            `Showcase up to ${membershipPlan.portfolioLimit} portfolio videos`,
                            "Weekly challenges with paid rewards",
                            "AI jobs marketplace access",
                        ].map((feature) => (
                            <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                <span>{feature}</span>
                            </li>
                        ))}
                    </ul>

                    <Link href="/billing" className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                        View Plan Details <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </section>

            {/* Trust Bar */}
            <section className="py-12 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between items-center gap-8 opacity-40">
                    <span className="text-xl font-bold italic tracking-widest">CHATGPT IMAGE 2</span>
                    <span className="text-xl font-bold italic tracking-widest">SEEDANCE 2.0</span>
                    <span className="text-xl font-bold italic tracking-widest">KLING 3.0</span>
                    <span className="text-xl font-bold italic tracking-widest">NANO BANANA 2</span>
                    <span className="text-xl font-bold italic tracking-widest">CLAUDE AI</span>
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
                                    key={playingVideo.url}
                                    src={playingVideo.url}
                                    controls
                                    autoPlay
                                    playsInline
                                    preload="auto"
                                    className="w-full h-full"
                                    onCanPlay={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}) }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <Footer />
        </main>
    )
}
