"use client"

import Footer from "@/components/Footer"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { adminShowcase as mockShowcase } from "@/lib/data"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"
import {
    ArrowRight,
    ArrowUpRight,
    Bot,
    CheckCircle2,
    Clapperboard,
    Film,
    Layers3,
    PenLine,
    Play,
    Sliders,
    Sparkles,
    Smartphone,
    Tv,
    Wand2,
    X,
    Zap,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

const frontierModels = [
    { name: "GPT-5.6 / Luna", category: "LLM Director" },
    { name: "Gemini 2.5 Pro", category: "Reasoning" },
    { name: "Seedance 2.0", category: "Video Motion" },
    { name: "Veo 3.1", category: "Cinematic Video" },
    { name: "Flux Pro 1.1", category: "Photoreal Images" },
    { name: "Kling 2.5", category: "Video Gen" },
    { name: "BytePlus V2", category: "Style Transfer" },
]

const pipelineSteps = [
    {
        id: "script",
        num: "01",
        label: "Script",
        title: "Autonomous Screenwriting",
        description: "The AI Director writes shoot-ready scenes, character dialogue, and shot descriptions from a single prompt.",
        accent: "from-primary/20 to-transparent",
    },
    {
        id: "role",
        num: "02",
        label: "Role & Assets",
        title: "Character Continuity & Turnarounds",
        description: "Generate consistent multi-angle character references, wardrobe sheets, and prop asset memory.",
        accent: "from-cyan-400/20 to-transparent",
    },
    {
        id: "storyboard",
        num: "03",
        label: "Storyboard",
        title: "Keyframes & Shot Cards",
        description: "Generate camera-specific keyframe visuals with automated prompt validation and continuity facts.",
        accent: "from-fuchsia-400/20 to-transparent",
    },
    {
        id: "timeline",
        num: "04",
        label: "Timeline",
        title: "Video Motion & Assembly",
        description: "Turn keyframe images into fluid motion clips with approval guards and full-auto production control.",
        accent: "from-amber-400/20 to-transparent",
    },
]

const adFormats = [
    {
        id: "ugc-1",
        title: "UGC Phone Review",
        niche: "Consumer Tech & Apps",
        tag: "9:16 Vertical",
        aspect: "aspect-[9/16]",
        gradient: "bg-[radial-gradient(circle_at_50%_30%,rgba(185,244,46,0.25),transparent_60%),linear-gradient(135deg,#0d1f14,#08090a)]",
    },
    {
        id: "ugc-2",
        title: "Beauty & Skincare Hook",
        niche: "Direct-to-Consumer",
        tag: "9:16 Reel",
        aspect: "aspect-[9/16]",
        gradient: "bg-[radial-gradient(circle_at_50%_30%,rgba(255,10,99,0.25),transparent_60%),linear-gradient(135deg,#240a15,#08090a)]",
    },
    {
        id: "ugc-3",
        title: "Fashion Editorial",
        niche: "Apparel & Style",
        tag: "9:16 Short",
        aspect: "aspect-[9/16]",
        gradient: "bg-[radial-gradient(circle_at_50%_30%,rgba(64,202,255,0.25),transparent_60%),linear-gradient(135deg,#0a1a24,#08090a)]",
    },
    {
        id: "ugc-4",
        title: "Sneaker Drop Commercial",
        niche: "Footwear & Streetwear",
        tag: "9:16 TikTok",
        aspect: "aspect-[9/16]",
        gradient: "bg-[radial-gradient(circle_at_50%_30%,rgba(255,199,64,0.25),transparent_60%),linear-gradient(135deg,#241d0a,#08090a)]",
    },
]

export default function LandingPage() {
    const { user, signInWithGoogle } = useAuth()
    const [adminShowcase, setAdminShowcase] = useState<any[]>(mockShowcase)
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)
    const [activePipelineStep, setActivePipelineStep] = useState(0)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from("showcase_items")
                    .select("*")
                    .order("created_at", { ascending: false })
                if (!error && data && data.length > 0) {
                    setAdminShowcase(
                        data.map((s: any) => ({
                            id: s.id,
                            title: s.title,
                            description: s.description,
                            thumbnail: s.thumbnail || "",
                            videoUrl: s.video_url || "",
                        }))
                    )
                }
            } catch {}
        }
        load()
    }, [])

    const heroFeatured = adminShowcase[0]

    return (
        <main className="min-h-screen bg-[#070806] text-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        name: "AI Director Hub",
                        url: "https://www.aidirectorhub.com",
                        logo: "https://www.aidirectorhub.com/logo.png",
                        description:
                            "AI Director Hub is an autonomous AI video creation platform powered by an AI Creative Director Employee for scripts, storyboards, characters, and high-converting ads.",
                    }),
                }}
            />
            <Navbar />

            {/* Reserved room for top navbar banner */}
            <div className="h-28" aria-hidden="true" />

            {/* SECTION 1: HERO STAGE (AUTONOMOUS AI VIDEO CREATION PLATFORM) */}
            <section className="relative mx-auto max-w-[1540px] px-4 pb-16 pt-6 md:px-6">
                <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0f0e] p-6 md:p-12">
                    {/* Background glow and subtle ambient lighting */}
                    <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[120px]" />
                    <div className="pointer-events-none absolute -right-40 -bottom-40 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />

                    <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-primary">
                                <Sparkles className="h-4 w-4" />
                                AUTONOMOUS AI VIDEO CREATION PLATFORM
                            </div>

                            <h1 className="mt-8 text-5xl font-black leading-[.92] tracking-tight md:text-7xl lg:text-8xl">
                                Turn text into <span className="text-primary">stunning videos</span> in minutes.
                            </h1>

                            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/60 md:text-xl">
                                An all-in-one AI video generator powered by your dedicated AI Director Employee.
                                It writes scripts, sets up character turnaround assets, builds storyboards, and renders broadcast-ready video clips.
                            </p>

                            <div className="mt-10 flex flex-wrap items-center gap-4">
                                {user ? (
                                    <Link href="/studio" className="btn-primary flex items-center gap-3 px-8 py-4 text-base font-black">
                                        Open Creator Studio <ArrowRight className="h-5 w-5" />
                                    </Link>
                                ) : (
                                    <button onClick={signInWithGoogle} className="btn-primary flex items-center gap-3 px-8 py-4 text-base font-black">
                                        Start Free Now <ArrowRight className="h-5 w-5" />
                                    </button>
                                )}
                                <Link href="/billing" className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[.04] px-7 py-4 text-base font-bold text-white transition hover:border-primary/50 hover:text-primary">
                                    View Plans & Credits <ArrowUpRight className="h-5 w-5" />
                                </Link>
                            </div>

                            {/* Key Stats Bar */}
                            <div className="mt-12 flex flex-wrap items-center gap-8 border-t border-white/10 pt-8 text-xs font-bold uppercase tracking-wider text-white/40">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-primary" />
                                    <span>Full-Auto & Guarded Approvals</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Film className="h-4 w-4 text-primary" />
                                    <span>Multi-Model Pipeline</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-primary" />
                                    <span>AI Creative Employee</span>
                                </div>
                            </div>
                        </div>

                        {/* HERO FEATURED VIDEO / MEDIA CONTAINER SLOT (USER CAN EMBED VIDEO HERE LATER) */}
                        <div className="relative group overflow-hidden rounded-[26px] border border-white/15 bg-[#141715] shadow-2xl transition duration-500 hover:border-primary/50">
                            <div className="relative aspect-video w-full bg-[#0a0c0b]">
                                {heroFeatured?.videoUrl ? (
                                    <video
                                        src={`${heroFeatured.videoUrl}#t=0.1`}
                                        muted
                                        loop
                                        autoPlay
                                        playsInline
                                        preload="metadata"
                                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                                    />
                                ) : heroFeatured?.thumbnail ? (
                                    <img src={heroFeatured.thumbnail} alt="Hero showcase" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                                ) : (
                                    /* Reserved Video Slot Visual Placeholder */
                                    <div className="relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(185,244,46,0.2),transparent_70%),linear-gradient(135deg,#121a14,#0a0c0b)] p-8 text-center">
                                        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/20 border border-primary/30 text-primary">
                                            <Play className="h-8 w-8 fill-primary" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-[.2em] text-primary">Featured AI Short Film</span>
                                        <h3 className="mt-2 text-xl font-black text-white">Reserved Hero Video Container</h3>
                                        <p className="mt-2 max-w-sm text-xs text-white/50">Space reserved for your main promotional video drop.</p>
                                    </div>
                                )}

                                {/* Ambient overlay & Play action trigger */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                                    <div>
                                        <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-black text-black uppercase">Featured Production</span>
                                        <h2 className="mt-2 text-xl font-black">{heroFeatured?.title || "Border Run — 60s AI Short"}</h2>
                                        <p className="line-clamp-1 text-xs text-white/60">{heroFeatured?.description || "Created with AI Director Employee & Veo 3"}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => heroFeatured?.videoUrl && setPlayingVideo({ url: heroFeatured.videoUrl, title: heroFeatured.title })}
                                        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-black transition duration-300 hover:scale-110"
                                    >
                                        <Play className="h-5 w-5 fill-black" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 2: CORE PILLARS (EVERY AI MODEL + AI DIRECTOR EMPLOYEE) */}
            <section className="mx-auto max-w-[1540px] px-4 py-12 md:px-6">
                <div className="grid gap-6 md:grid-cols-2">
                    {/* PILLAR 1: EVERY AI MODEL UNDER ONE PROMPT */}
                    <div className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 bg-[#111312] p-8 transition hover:border-primary/40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(64,202,255,0.08),transparent_50%)]" />
                        <div className="relative z-10">
                            <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-cyan-400">
                                Models
                            </span>
                            <h2 className="mt-6 text-3xl font-black tracking-tight md:text-4xl">Every Frontier AI Model</h2>
                            <p className="mt-4 text-base leading-7 text-white/60">
                                All the leading frontier models under one prompt — GPT-5.6, Gemini 2.5 Pro & Flash, Seedance 2.0, Veo 3.1, Flux Pro, Kling 2.5, and BytePlus. Switch, compare, and combine in seconds.
                            </p>

                            {/* Model Badges Pills */}
                            <div className="mt-8 flex flex-wrap gap-2.5">
                                {frontierModels.map((m) => (
                                    <div key={m.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2 text-xs font-bold transition hover:border-cyan-400/40">
                                        <span className="h-2 w-2 rounded-full bg-cyan-400" />
                                        <span>{m.name}</span>
                                        <span className="text-[10px] text-white/40">({m.category})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="relative z-10 mt-10">
                            <Link href="/studio" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-400 transition group-hover:translate-x-1">
                                Browse Models & Routing <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>

                    {/* PILLAR 2: AUTONOMOUS AI DIRECTOR EMPLOYEE */}
                    <div className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 bg-[#111312] p-8 transition hover:border-primary/40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(185,244,46,0.08),transparent_50%)]" />
                        <div className="relative z-10">
                            <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-primary">
                                Agent
                            </span>
                            <h2 className="mt-6 text-3xl font-black tracking-tight md:text-4xl">AI Director Employee</h2>
                            <p className="mt-4 text-base leading-7 text-white/60">
                                One idea, one prompt. Your fully autonomous AI Director Employee handles script editing, character turnaround setup, storyboarding, and final video edits — automatically.
                            </p>

                            {/* Interactive Mock Chat & Action Log Card */}
                            <div className="mt-8 rounded-2xl border border-white/10 bg-[#080a09] p-4 text-xs">
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <div className="flex items-center gap-2 font-bold text-primary">
                                        <Bot className="h-4 w-4" />
                                        <span>Director Agent</span>
                                    </div>
                                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">ACTIVE</span>
                                </div>

                                <div className="mt-3 rounded-xl bg-white/[.04] p-3 text-white/80 italic">
                                    &quot;Make a 60-second sci-fi short about an astronaut who discovers life on Mars.&quot;
                                </div>

                                <div className="mt-3 space-y-2 text-white/60">
                                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>Analyzing story structure & narrative arc</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>Building multi-angle character profiles & turnaround references</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-primary font-medium">
                                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                                        <span>Generating 6-shot camera storyboard & shot cards...</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 mt-10">
                            <Link href="/studio" className="inline-flex items-center gap-2 text-sm font-bold text-primary transition group-hover:translate-x-1">
                                Meet Your Agent <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 3: VISUAL PRODUCTION PIPELINE ("HOW IT WORKS") */}
            <section className="mx-auto max-w-[1540px] px-4 py-16 md:px-6">
                <div className="rounded-[32px] border border-white/10 bg-[#0d0f0e] p-6 md:p-12">
                    <div className="text-center">
                        <span className="text-xs font-black uppercase tracking-[.25em] text-primary">HOW IT WORKS</span>
                        <h2 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                            Create a highly consistent short film in 10 minutes — fully automated
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-base text-white/60">
                            From prompt to final cut, watch your AI Creative Employee orchestrate every stage of video production.
                        </p>
                    </div>

                    {/* Pipeline Selector Steps Tabs */}
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {pipelineSteps.map((step, idx) => (
                            <button
                                key={step.id}
                                onClick={() => setActivePipelineStep(idx)}
                                className={cn(
                                    "relative flex flex-col justify-between rounded-2xl border p-6 text-left transition duration-300",
                                    activePipelineStep === idx
                                        ? "border-primary bg-primary/[.08] shadow-[0_0_30px_rgba(185,244,46,0.15)]"
                                        : "border-white/10 bg-white/[.03] hover:border-white/20 hover:bg-white/[.05]"
                                )}
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl font-black italic text-primary">{step.num}</span>
                                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70">{step.label}</span>
                                    </div>
                                    <h3 className="mt-6 text-xl font-black">{step.title}</h3>
                                    <p className="mt-3 text-xs leading-6 text-white/50">{step.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Visual Stage Container Slot for Full Film Showcase Video */}
                    <div className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-[#121513] p-4 md:p-6">
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#090b0a]">
                            {/* Showcase film video or clean reserved container */}
                            {heroFeatured?.videoUrl ? (
                                <video
                                    key={pipelineSteps[activePipelineStep].id}
                                    src={`${heroFeatured.videoUrl}#t=0.1`}
                                    controls
                                    playsInline
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(185,244,46,0.15),transparent_65%),linear-gradient(135deg,#131f16,#08090a)] p-8 text-center">
                                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/20 border border-primary/30 text-primary mb-4">
                                        <Play className="h-8 w-8 fill-primary" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-[.2em] text-primary">
                                        {pipelineSteps[activePipelineStep].label} Showcase Video
                                    </span>
                                    <h3 className="mt-2 text-2xl font-black text-white">
                                        Reserved Player Container ({pipelineSteps[activePipelineStep].title})
                                    </h3>
                                    <p className="mt-2 max-w-md text-xs text-white/50">
                                        Space reserved for your 3-minute fully automated short film or stage demo video.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 4: HIGH-CONVERTING VIDEO ADS & CONTENT FORMATS (VERTICAL UGC 9:16 Showcase) */}
            <section className="mx-auto max-w-[1540px] px-4 py-16 md:px-6">
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <span className="text-xs font-black uppercase tracking-[.25em] text-primary">COMMERCIAL & SOCIAL CREATIVES</span>
                        <h2 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Create the best video ads with AI.</h2>
                        <p className="mt-3 max-w-2xl text-base text-white/60">
                            Generate UGC-style ad creatives at scale — test hooks, iterate in hours, and ship to TikTok, Reels, and Shorts the same day.
                        </p>
                    </div>

                    <Link href="/studio" className="btn-primary flex items-center gap-2 px-6 py-3 text-sm font-black">
                        Create Ad Campaign <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                {/* Vertical 9:16 UGC & Commercial Ads Grid */}
                <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {adFormats.map((ad, idx) => {
                        const showcaseItem = adminShowcase[idx + 1] || adminShowcase[0]
                        return (
                            <div
                                key={ad.id}
                                className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[#121413] transition duration-500 hover:border-primary/50"
                            >
                                <div className={cn("relative w-full overflow-hidden", ad.aspect, ad.gradient)}>
                                    {showcaseItem?.videoUrl ? (
                                        <video
                                            src={`${showcaseItem.videoUrl}#t=0.1`}
                                            muted
                                            loop
                                            autoPlay
                                            playsInline
                                            preload="metadata"
                                            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                                        />
                                    ) : showcaseItem?.thumbnail ? (
                                        <img src={showcaseItem.thumbnail} alt={ad.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                                    ) : (
                                        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                                            <Smartphone className="h-10 w-10 text-primary/60 mb-3" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">{ad.tag}</span>
                                            <h4 className="mt-2 text-lg font-black">{ad.title}</h4>
                                            <p className="mt-1 text-xs text-white/40">Reserved 9:16 Video Slot</p>
                                        </div>
                                    )}

                                    {/* Overlay details */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                                    <div className="absolute bottom-5 left-5 right-5">
                                        <span className="rounded-full bg-primary/20 border border-primary/30 px-3 py-1 text-[10px] font-black uppercase text-primary">
                                            {ad.tag}
                                        </span>
                                        <h3 className="mt-3 text-xl font-black">{ad.title}</h3>
                                        <p className="mt-1 text-xs text-white/60">{ad.niche}</p>
                                    </div>

                                    {/* Play trigger button */}
                                    {showcaseItem?.videoUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setPlayingVideo({ url: showcaseItem.videoUrl, title: ad.title })}
                                            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-primary text-black transition group-hover:scale-110"
                                        >
                                            <Play className="h-4 w-4 fill-black" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* SECTION 5: FINAL HIGH-CONVERTING STUDIO CTA BANNER */}
            <section className="mx-auto max-w-[1540px] px-4 py-16 md:px-6">
                <div className="relative overflow-hidden rounded-[32px] border border-primary/30 bg-[linear-gradient(135deg,#152014,#0b0d0c_60%,#1a2a11)] p-8 text-center md:p-16">
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />

                    <div className="relative z-10 mx-auto max-w-3xl">
                        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary text-black">
                            <Wand2 className="h-8 w-8" />
                        </div>
                        <h2 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">
                            Build your next AI video with an AI Creative Employee.
                        </h2>
                        <p className="mt-5 text-lg font-medium text-white/60">
                            Upload references, ask the Director for a script, generate images instantly, approve videos when ready, and keep the whole production organized.
                        </p>

                        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                            {user ? (
                                <Link href="/studio" className="btn-primary px-9 py-4 text-base font-black">
                                    Open AI Director Studio <ArrowRight className="ml-2 h-5 w-5 inline" />
                                </Link>
                            ) : (
                                <button onClick={signInWithGoogle} className="btn-primary px-9 py-4 text-base font-black">
                                    Start Free Now <ArrowRight className="ml-2 h-5 w-5 inline" />
                                </button>
                            )}
                            <Link href="/billing" className="rounded-2xl border border-white/20 bg-white/[.05] px-9 py-4 font-bold text-white transition hover:border-primary/50 hover:text-primary">
                                See Credits & Plans
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bottom Tag Bar */}
            <section className="border-y border-white/5 bg-white/[0.01] py-8">
                <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-6 text-xs font-black uppercase tracking-[.2em] text-white/30">
                    <span>AI Director Employee</span>
                    <span>Multi-Model Engine</span>
                    <span>Storyboard Workflow</span>
                    <span>Guarded Approvals</span>
                    <span>UGC Video Ads</span>
                </div>
            </section>

            {/* VIDEO PLAYER MODAL */}
            <AnimatePresence>
                {playingVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl md:p-8"
                        onClick={() => setPlayingVideo(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0f0f15] shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-white/5 p-5">
                                <h3 className="text-xl font-bold">{playingVideo.title}</h3>
                                <button
                                    onClick={() => setPlayingVideo(null)}
                                    className="rounded-2xl p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
                                >
                                    <X className="h-7 w-7" />
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
                                    className="h-full w-full"
                                    onCanPlay={(event) => {
                                        ;(event.target as HTMLVideoElement).play().catch(() => {})
                                    }}
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
