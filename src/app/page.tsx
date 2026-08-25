"use client"

import Footer from "@/components/Footer"
import { isFreeCourse } from "@/lib/course-price"
import LeadChatWidget from "@/components/LeadChatWidget"
import Navbar from "@/components/Navbar"
import HoverSoundVideo from "@/components/HoverSoundVideo"
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
    Layers3,
    PenLine,
    Play,
    Sliders,
    Sparkles,
    Smartphone,
    Tv,
    Wand2,
    X,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

// The models named on the landing page. Kept in step with
// src/lib/studio/generation-models.ts by hand — a visitor who reads a name here
// and cannot find it in the picker has been told something untrue.
const frontierModels = [
    { name: "Seedance 2.5", category: "Video Motion", live: true },
    { name: "Kling 3.0", category: "Cinematic Video" },
    { name: "Kling O3", category: "Video Reasoning" },
    { name: "Veo 3.1", category: "Cinematic Video" },
    { name: "GPT Image 2", category: "Image Gen" },
    { name: "Nano Banana 2 Pro", category: "Photoreal Images" },
    { name: "Nano Banana 2", category: "Image Gen" },
    { name: "GPT-5.6 / Luna", category: "LLM Director" },
    { name: "Gemini 3.6 Flash", category: "Reasoning" },
]

const pipelineSteps = [
    {
        id: "script",
        num: "01",
        label: "Script",
        title: "Write the story",
        description: "",
        accent: "from-primary/15 to-transparent",
    },
    {
        id: "role",
        num: "02",
        label: "Role & Assets",
        title: "Build the world",
        description: "",
        accent: "from-primary/15 to-transparent",
    },
    {
        id: "storyboard",
        num: "03",
        label: "Storyboard",
        title: "Plan the shots",
        description: "",
        accent: "from-primary/15 to-transparent",
    },
    {
        id: "timeline",
        num: "04",
        label: "Timeline",
        title: "Make the video",
        description: "",
        accent: "from-primary/15 to-transparent",
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

/**
 * Turns a YouTube link into an embeddable one.
 *
 * A showcase entry may hold a YouTube page URL rather than an uploaded file.
 * `<video>` can only play actual media, so such an entry rendered as an empty
 * black box. Returns null for anything that is a real media URL, which keeps the
 * normal video element in use for uploads.
 */
/** A Short is shot vertically, so the frame that holds it should be too. */
function isVerticalVideo(url: string) {
    return /youtube\.com\/shorts\//i.test(url || "")
}

function youtubeEmbedUrl(url: string): string | null {
    if (!url) return null
    const watch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{6,})/)
    if (!watch) return null
    const start = url.match(/[?&](?:t|start)=(\d+)/)
    // The standard domain, not youtube-nocookie: the privacy-enhanced host
    // refuses some videos — Shorts especially — that youtube.com serves fine.
    return `https://www.youtube.com/embed/${watch[1]}?rel=0&modestbranding=1${start ? `&start=${start[1]}` : ""}`
}

export default function LandingPage() {
    const { user, signInWithGoogle } = useAuth()
    const [adminShowcase, setAdminShowcase] = useState<any[]>(mockShowcase)
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)
    // An uploaded file carries no hint of its shape in the URL, so the video
    // element reports it once metadata loads. A YouTube Short is known from the
    // link alone and needs no measuring.
    const [heroIsVertical, setHeroIsVertical] = useState(false)
    const [activePipelineStep, setActivePipelineStep] = useState(0)
    // The free course to point the Academy button at. Looked up rather than
    // hard-coded, so renaming or replacing the free course in admin does not
    // leave a home-page button pointing at a course that no longer exists.
    const [freeCourse, setFreeCourse] = useState<{ id: string; title: string } | null>(null)

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

    useEffect(() => {
        const loadFreeCourse = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from("courses")
                    .select("id, title, price, is_paused")
                    .order("created_at", { ascending: true })
                if (error || !data) return
                // "Free" is price 0 or unset. A paused course is not on offer,
                // so linking to it would send people to a page that hides it.
                const free = data.find((course: any) => !course.is_paused && isFreeCourse(course.price))
                if (free) setFreeCourse({ id: free.id, title: free.title })
            } catch {}
        }
        loadFreeCourse()
    }, [])

    const heroFeatured = adminShowcase[0]
    useEffect(() => { setHeroIsVertical(false) }, [heroFeatured?.videoUrl])
    // The hero already plays adminShowcase[0], so the grid starts after it when
    // there is enough material, and uses everything when there is not.
    const slotShowcase = useMemo(() => {
        const pool = adminShowcase.length > 4 ? adminShowcase.slice(1) : adminShowcase
        return [0, 1, 2, 3].map((index) => pool[index])
    }, [adminShowcase])

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
            <div className="h-24 md:h-20" aria-hidden="true" />

            {/* SECTION 1: HERO STAGE — sell the outcome before explaining the product. */}
            <section className="relative mx-auto max-w-[1540px] px-4 pb-12 pt-4 md:px-6 md:pb-16 md:pt-6">
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0f0e] p-5 sm:p-6 md:p-12">
                    {/* Background glow and subtle ambient lighting */}
                    <div className="pointer-events-none absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-primary/[.07] blur-[140px]" />

                    <div className="relative z-10 grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-10">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 t-caption text-white/60">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                Stop prompting. Start directing.
                            </div>

                            {/* Desktop carries the complete promise. The mobile version
                                deliberately removes a line so the CTA remains visible early. */}
                            <h1 className="mt-5 hidden max-w-3xl t-display md:block">
                                Give your AI Director an idea. Get a <span className="text-primary">production.</span>
                            </h1>
                            <h1 className="mt-5 max-w-xl text-[2.55rem] font-semibold leading-[1.04] tracking-[-0.035em] md:hidden">
                                Give your AI Director an idea. Get a <span className="text-primary">production.</span>
                            </h1>

                            <p className="mt-5 hidden max-w-xl t-body-lg text-white/60 md:block">
                                Script. Characters. Storyboard. Images. Video. Your AI Director coordinates the entire workflow
                                across the latest AI models while you stay in control.
                            </p>
                            <p className="mt-4 max-w-md text-[15px] leading-6 text-white/60 md:hidden">
                                Script. Characters. Storyboard. Images. Video. Your AI Director coordinates the whole workflow while you stay in control.
                            </p>
                            <p className="mt-3 max-w-xl text-sm leading-6 text-white/45 md:mt-4 md:text-base">
                                Subscribers can use their own OpenAI, Google, BytePlus, or fal.ai API keys at provider rates, or generate instantly with studio credits.
                            </p>

                            <div className="mt-7 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                                {user ? (
                                    <Link href="/studio" className="btn-primary flex items-center justify-center gap-2.5 px-7 py-3.5 text-[15px]">
                                        Hire Your AI Director <ArrowRight className="h-5 w-5" />
                                    </Link>
                                ) : (
                                    <button onClick={() => signInWithGoogle()} className="btn-primary flex items-center justify-center gap-2.5 px-7 py-3.5 text-[15px]">
                                        Hire Your AI Director <ArrowRight className="h-5 w-5" />
                                    </button>
                                )}
                                <a href="#showcase" className="btn-secondary flex items-center justify-center gap-2 px-7 py-3.5 text-[15px]">
                                    See It Build a Video <Play className="h-4 w-4 fill-current" />
                                </a>
                            </div>

                            {/* Short reassurance, not a second product explanation. */}
                            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/50 sm:mt-10 sm:gap-x-6 sm:border-t sm:border-white/10 sm:pt-7 sm:t-caption">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
                                    <span>One Prompt → Full Production</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
                                    <span>BYO API</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                    <span>Frontier AI Models</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                    <span>Full-Auto Available</span>
                                </div>
                            </div>
                        </div>

                        {/* HERO FEATURED VIDEO / MEDIA CONTAINER SLOT (USER CAN EMBED VIDEO HERE LATER) */}
                        <div className="relative group overflow-hidden rounded-lg border border-white/15 bg-[#141715] shadow-2xl transition duration-500 hover:border-primary/50">
                            <div className={cn(
                                "relative w-full bg-[#0a0c0b]",
                                // Matching the source's shape beats letterboxing it: a vertical
                                // episode shown in a landscape card is mostly black bars.
                                heroIsVertical || (heroFeatured?.videoUrl && isVerticalVideo(heroFeatured.videoUrl))
                                    ? "mx-auto aspect-[9/16] max-w-[420px]"
                                    : "aspect-video",
                            )}>
                                {heroFeatured?.videoUrl && youtubeEmbedUrl(heroFeatured.videoUrl) ? (
                                    <iframe
                                        src={`${youtubeEmbedUrl(heroFeatured.videoUrl)}&autoplay=1&mute=1&controls=0&playsinline=1`}
                                        title={heroFeatured.title}
                                        allow="autoplay; encrypted-media; picture-in-picture"
                                        className="pointer-events-none h-full w-full"
                                    />
                                ) : heroFeatured?.videoUrl ? (
                                    <HoverSoundVideo
                                        src={`${heroFeatured.videoUrl}#t=0.1`}
                                        // The hero is the one clip that turns its own sound on.
                                        // The showcase cards below stay hover-only, or the page
                                        // plays three soundtracks at once.
                                        autoSound
                                        loop
                                        autoPlay
                                        preload="metadata"
                                        onLoadedMetadata={(event) => {
                                            const el = event.currentTarget
                                            setHeroIsVertical(el.videoHeight > el.videoWidth)
                                        }}
                                        className="h-full w-full object-cover transition-transform duration-700"
                                    />
                                ) : heroFeatured?.thumbnail ? (
                                    <img src={heroFeatured.thumbnail} alt="Hero showcase" className="h-full w-full object-cover transition-transform duration-700" />
                                ) : (
                                    /* Reserved Video Slot Visual Placeholder */
                                    <div className="relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(185,244,46,0.2),transparent_70%),linear-gradient(135deg,#121a14,#0a0c0b)] p-8 text-center">
                                        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/20 border border-primary/30 text-primary">
                                            <Play className="h-8 w-8 fill-primary" />
                                        </div>
                                        <span className="t-caption text-primary">Featured AI Short Film</span>
                                        <h3 className="mt-2 text-xl font-semibold text-white">Reserved Hero Video Container</h3>
                                        <p className="mt-2 max-w-sm text-xs text-white/50">Space reserved for your main promotional video drop.</p>
                                    </div>
                                )}

                                {/* Ambient overlay & Play action trigger */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                                    <div>
                                        <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-black">Featured Production</span>
                                        <h2 className="mt-2 text-xl font-semibold">{heroFeatured?.title || "Border Run — 60s AI Short"}</h2>
                                        <p className="line-clamp-1 text-xs text-white/60">{heroFeatured?.description || "Created with AI Director Employee & Veo 3"}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => heroFeatured?.videoUrl && setPlayingVideo({ url: heroFeatured.videoUrl, title: heroFeatured.title })}
                                        className="grid h-12 w-12 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-primary text-black transition-transform duration-press ease-out active:scale-95"
                                    >
                                        <Play className="h-5 w-5 fill-black" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* LEAD MAGNET: the course is a short product walkthrough, not a
                competing offer. It gives a hesitant visitor a low-friction reason
                to create an account after seeing the work above. */}
            <section className="mx-auto max-w-[1540px] px-4 md:px-6">
                <div className="flex flex-col gap-6 rounded-lg border border-white/10 bg-[#111312] p-8 md:flex-row md:items-center md:justify-between">
                    <div>
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[.04] px-3 py-1 t-caption text-white/60">
                            Free mini course
                        </span>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                            Make your first video.
                        </h2>
                        <p className="mt-3 max-w-xl text-base leading-7 text-white/60">
                            A quick walkthrough of the studio. Free to start.
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
                        {/* Falls back to the listing when nothing free is published,
                            rather than rendering a button that goes nowhere. */}
                        <Link
                            href={freeCourse ? `/courses/${freeCourse.id}` : "/courses"}
                            className="btn-primary flex items-center justify-center gap-2.5 whitespace-nowrap px-7 py-3.5 text-[15px]"
                        >
                            Start the free mini course <ArrowRight className="h-5 w-5" />
                        </Link>
                        <Link
                            href="/courses"
                            className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap px-7 py-3.5 text-[15px]"
                        >
                            See what you&apos;ll learn <ArrowUpRight className="h-5 w-5" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* CONTROL MODES: automation is a spectrum, not an all-or-nothing promise. */}
            <section className="mx-auto max-w-[1540px] px-4 py-8 md:px-6 md:py-10">
                <div className="rounded-xl border border-white/10 bg-[#0d0f0e] p-5 md:p-7">
                    <div>
                        <span className="t-caption text-primary">YOUR CONTROL, YOUR PACE</span>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                            Choose your control level.
                        </h2>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3 md:gap-4">
                        <div className="rounded-lg border border-white/10 bg-white/[.03] p-4">
                            <h3 className="text-base font-semibold">Manual</h3>
                            <p className="mt-1 text-sm text-white/60">Approve every step.</p>
                        </div>
                        <div className="rounded-lg border border-primary/25 bg-primary/[.05] p-4">
                            <h3 className="text-base font-semibold text-primary">Semi-auto</h3>
                            <p className="mt-1 text-sm text-white/60">AI sets up. You approve video.</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[.03] p-4">
                            <h3 className="text-base font-semibold">Full auto</h3>
                            <p className="mt-1 text-sm text-white/60">AI finishes within your limits.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 2: CORE PILLARS (EVERY AI MODEL + AI DIRECTOR EMPLOYEE) */}
            <section className="mx-auto max-w-[1540px] px-4 py-8 md:px-6 md:py-10">
                <div className="grid gap-4 md:grid-cols-2">
                    {/* PILLAR 1: EVERY AI MODEL UNDER ONE PROMPT */}
                    <div className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-[#111312] p-6 transition hover:border-primary/40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(185,244,46,0.05),transparent_50%)]" />
                        <div className="relative z-10">
                            <span className="inline-flex rounded-full border border-white/10 bg-white/[.04] px-3 py-1 t-caption text-white/60">
                                Models
                            </span>
                            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Every model. One workspace.</h2>
                            <p className="mt-3 text-base leading-7 text-white/60">
                                Choose, compare, and combine the models you need.
                            </p>

                            {/* Model Badges Pills */}
                            <div className="mt-5 flex flex-wrap gap-2">
                                {frontierModels.slice(0, 6).map((m) => (
                                    <div
                                        key={m.name}
                                        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                                            m.live
                                                ? "border-primary/40 bg-primary/[.06] hover:border-primary/70"
                                                : "border-white/10 bg-white/[.04] hover:border-white/25"
                                        }`}
                                    >
                                        <span className={`h-2 w-2 rounded-full bg-primary ${m.live ? "animate-pulse" : ""}`} />
                                        <span>{m.name}</span>
                                        {m.live && (
                                            <span className="rounded-md bg-primary px-1.5 py-0.5 t-caption tracking-wide text-black">
                                                Live
                                            </span>
                                        )}
                                    </div>
                                ))}
                                <div className="flex items-center rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2 text-xs font-bold text-white/60">
                                    + more
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 mt-6">
                            <Link href="/studio" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary transition group-hover:translate-x-1 sm:min-h-0">
                                Browse Models & Routing <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>

                    {/* PILLAR 2: AUTONOMOUS AI DIRECTOR EMPLOYEE */}
                    <div className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-[#111312] p-6 transition hover:border-primary/40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(185,244,46,0.08),transparent_50%)]" />
                        <div className="relative z-10">
                            <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 t-caption text-primary">
                                Agent
                            </span>
                            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">One brief. One AI Director.</h2>
                            <p className="mt-3 text-base leading-7 text-white/60">
                                Script, storyboard, and video—at your chosen control level.
                            </p>

                            {/* Interactive Mock Chat & Action Log Card */}
                            <div className="mt-5 rounded-2xl border border-white/10 bg-[#080a09] p-4 text-xs">
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <div className="flex items-center gap-2 font-bold text-primary">
                                        <Bot className="h-4 w-4" />
                                        <span>Director Agent</span>
                                    </div>
                                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary">ACTIVE</span>
                                </div>

                                <div className="mt-3 rounded-xl bg-white/[.04] p-3 text-white/80 italic">
                                    &quot;Create a short sci-fi film about life on Mars.&quot;
                                </div>

                                <div className="mt-3 space-y-2 text-white/60">
                                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>Writing the story</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>Building characters</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-primary font-medium">
                                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                                        <span>Planning the shots...</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 mt-6">
                            <Link href="/studio" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary transition group-hover:translate-x-1 sm:min-h-0">
                                Meet Your Agent <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 3: VISUAL PRODUCTION PIPELINE ("HOW IT WORKS") */}
            <section className="mx-auto max-w-[1540px] px-4 py-8 md:px-6 md:py-10">
                <div className="rounded-xl border border-white/10 bg-[#0d0f0e] p-6 md:p-8">
                    <div className="text-center">
                        <span className="t-caption text-primary">HOW IT WORKS</span>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">From brief to video.</h2>
                    </div>

                    {/* Pipeline Selector Steps Tabs */}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {pipelineSteps.map((step, idx) => (
                            <button
                                key={step.id}
                                onClick={() => setActivePipelineStep(idx)}
                                className={cn(
                                    "relative flex flex-col justify-between rounded-2xl border p-4 text-left transition duration-300",
                                    activePipelineStep === idx
                                        ? "border-primary bg-primary/[.08] shadow-[0_0_30px_rgba(185,244,46,0.15)]"
                                        : "border-white/10 bg-white/[.03] hover:border-white/20 hover:bg-white/[.05]"
                                )}
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl font-semibold italic text-primary">{step.num}</span>
                                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70">{step.label}</span>
                                    </div>
                                    <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                                </div>
                            </button>
                        ))}
                    </div>

                </div>
            </section>

            {/* SECTION 4: HIGH-CONVERTING VIDEO ADS & CONTENT FORMATS (VERTICAL UGC 9:16 Showcase) */}
            <section id="showcase" className="mx-auto max-w-[1540px] scroll-mt-24 px-4 py-16 md:px-6">
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <span className="t-caption text-primary">COMMERCIAL & SOCIAL CREATIVES</span>
                        <h2 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">Create the best video ads with AI.</h2>
                        <p className="mt-3 max-w-2xl text-base text-white/60">
                            Generate UGC-style ad creatives at scale — test hooks, iterate in hours, and ship to TikTok, Reels, and Shorts the same day.
                        </p>
                    </div>

                    <Link href="/studio" className="btn-primary flex items-center gap-2 px-6 py-3 text-sm font-semibold">
                        Create Ad Campaign <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                {/* Vertical 9:16 UGC & Commercial Ads Grid */}
                <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {adFormats.map((ad, idx) => {
                        // One showcase item per slot. The fallback used to be
                        // adminShowcase[0] for every empty slot, so a single
                        // uploaded video played in all four tiles. A slot with
                        // nothing behind it now shows its reserved placeholder,
                        // which also makes it obvious where the next one goes.
                        const showcaseItem = slotShowcase[idx]
                        // A filled slot shows what was actually uploaded. The
                        // adFormats copy is placeholder text for an empty slot,
                        // and leaving it over real footage mislabels the work.
                        const slotTitle = showcaseItem?.title || ad.title
                        const slotSubtitle = showcaseItem?.description || ad.niche
                        return (
                            <div
                                key={ad.id}
                                className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#121413] transition duration-500 hover:border-primary/50"
                            >
                                <div className={cn("relative w-full overflow-hidden", ad.aspect, ad.gradient)}>
                                    {showcaseItem?.videoUrl && youtubeEmbedUrl(showcaseItem.videoUrl) ? (
                                        <iframe
                                            src={`${youtubeEmbedUrl(showcaseItem.videoUrl)}&autoplay=1&mute=1&loop=1&controls=0&playsinline=1&playlist=${youtubeEmbedUrl(showcaseItem.videoUrl)?.split("/embed/")[1]?.split("?")[0]}`}
                                            title={slotTitle}
                                            allow="autoplay; encrypted-media; picture-in-picture"
                                            className="pointer-events-none h-full w-full"
                                        />
                                    ) : showcaseItem?.videoUrl ? (
                                        <HoverSoundVideo
                                            src={`${showcaseItem.videoUrl}#t=0.1`}
                                            loop
                                            autoPlay
                                            preload="metadata"
                                            className="h-full w-full object-cover transition-transform duration-700"
                                        />
                                    ) : showcaseItem?.thumbnail ? (
                                        <img src={showcaseItem.thumbnail} alt={slotTitle} className="h-full w-full object-cover transition-transform duration-700" />
                                    ) : (
                                        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                                            <Smartphone className="h-10 w-10 text-primary/60 mb-3" />
                                            <span className="t-caption text-primary">{ad.tag}</span>
                                            <h4 className="mt-2 text-lg font-semibold">{ad.title}</h4>
                                            <p className="mt-1 text-xs text-white/40">Reserved 9:16 Video Slot</p>
                                        </div>
                                    )}

                                    {/* Overlay details */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                                    <div className="absolute bottom-5 left-5 right-5">
                                        <span className="rounded-full bg-primary/20 border border-primary/30 px-3 py-1 t-caption text-primary">
                                            {ad.tag}
                                        </span>
                                        <h3 className="mt-3 text-xl font-semibold">{slotTitle}</h3>
                                        <p className="mt-1 text-xs text-white/60 line-clamp-2">{slotSubtitle}</p>
                                    </div>

                                    {/* Play trigger button */}
                                    {showcaseItem?.videoUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setPlayingVideo({ url: showcaseItem.videoUrl, title: slotTitle })}
                                            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-primary text-black transition"
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
            <section className="mx-auto max-w-[1540px] px-4 py-10 md:px-6 md:py-12">
                <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-[linear-gradient(135deg,#152014,#0b0d0c_60%,#1a2a11)] p-8 text-center md:p-12">
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />

                    <div className="relative z-10 mx-auto max-w-3xl">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-black">
                            <Wand2 className="h-6 w-6" />
                        </div>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                            Ready to make your next video?
                        </h2>
                        <p className="mt-3 text-base font-medium text-white/60">
                            One workspace, from idea to final clip.
                        </p>

                        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                            {user ? (
                                <Link href="/studio" className="btn-primary px-9 py-4 text-base font-semibold">
                                    Create a video <ArrowRight className="ml-2 h-5 w-5 inline" />
                                </Link>
                            ) : (
                                <button onClick={() => signInWithGoogle()} className="btn-primary px-9 py-4 text-base font-semibold">
                                    Create a video <ArrowRight className="ml-2 h-5 w-5 inline" />
                                </button>
                            )}
                            <Link href="/billing" className="rounded-2xl border border-white/20 bg-white/[.05] px-9 py-4 font-bold text-white transition hover:border-primary/50 hover:text-primary">
                                See plans
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bottom Tag Bar */}
            <section className="border-y border-white/5 bg-white/[0.01] py-8">
                <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-6 t-caption text-white/30">
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
                                {youtubeEmbedUrl(playingVideo.url) ? (
                                    <iframe
                                        key={playingVideo.url}
                                        src={`${youtubeEmbedUrl(playingVideo.url)}&autoplay=1`}
                                        title={playingVideo.title}
                                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                        allowFullScreen
                                        className="h-full w-full"
                                    />
                                ) : (
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
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Footer />
            <LeadChatWidget />
        </main>
    )
}
