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
    Brain,
    Clapperboard,
    Film,
    Image as ImageIcon,
    Layers3,
    Mic2,
    PenLine,
    Play,
    Plus,
    Sparkles,
    Wand2,
    X,
    Zap,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

const featureCards = [
    {
        title: "AI Director Agent",
        description: "Chat or speak with an AI employee that plans scripts, shots, assets, images, approvals, and video generation.",
        icon: Bot,
        accent: "from-primary/30 to-primary/5",
    },
    {
        title: "AI Image Studio",
        description: "Generate product visuals, character references, storyboards, keyframes, thumbnails, and campaign images.",
        icon: ImageIcon,
        accent: "from-cyan-400/25 to-primary/5",
    },
    {
        title: "AI Video Workflow",
        description: "Move from storyboard images to generated clips with approval-first or full-auto production control.",
        icon: Film,
        accent: "from-fuchsia-400/20 to-primary/5",
    },
    {
        title: "Asset Memory",
        description: "Upload image, video, and audio references so the Director can attach them to characters, assets, and shots.",
        icon: Layers3,
        accent: "from-amber-300/20 to-primary/5",
    },
    {
        title: "Voice Control",
        description: "Run the workflow hands-free with a ChatGPT voice agent that understands your production context.",
        icon: Mic2,
        accent: "from-emerald-300/20 to-primary/5",
    },
    {
        title: "Workflow Skills",
        description: "Choose instruction sets for storyboard images, character continuity, video generation, and episode-wide style.",
        icon: Brain,
        accent: "from-blue-400/20 to-primary/5",
    },
]

const galleryFallbacks = [
    ["Product Ad", "Cinematic perfume bottle, glass reflections, macro lighting", "bg-[radial-gradient(circle_at_30%_20%,rgba(190,255,30,.55),transparent_28%),linear-gradient(135deg,#0d2116,#111318_58%,#273b14)]"],
    ["Character Film", "Reusable hero character with matching wardrobe and mood", "bg-[radial-gradient(circle_at_72%_24%,rgba(81,202,255,.48),transparent_26%),linear-gradient(135deg,#15151c,#182b32_52%,#08090b)]"],
    ["Storyboard", "Six-shot ad board with camera, action, and generation notes", "bg-[linear-gradient(135deg,#1b1d1f,#293118_45%,#0b0d0d)]"],
    ["Social Campaign", "Vertical reels, thumbnails, captions, hooks, and variations", "bg-[radial-gradient(circle_at_68%_32%,rgba(255,85,172,.38),transparent_28%),linear-gradient(135deg,#121318,#2c1832_55%,#070708)]"],
    ["Music Visual", "Fast-cut surreal visuals with audio and style references", "bg-[radial-gradient(circle_at_28%_30%,rgba(255,199,64,.42),transparent_30%),linear-gradient(135deg,#1b150c,#1b1d22_48%,#07151a)]"],
    ["Full Episode", "Script, characters, scenes, storyboard, clips, and final plan", "bg-[linear-gradient(135deg,#0a1310,#17251d_46%,#303517)]"],
]

const workflowSteps = [
    ["01", "Ask", "Describe an ad, short film, product demo, reel, or full episode in normal language."],
    ["02", "Plan", "The Director creates the script, production notes, workflow, assets, and shot strategy."],
    ["03", "Create", "Generate images immediately, or approve storyboard and video jobs before spending credits."],
    ["04", "Revise", "Keep every output attached to script, assets, storyboard shots, and references."],
]

const productionCards = [
    { title: "Script", description: "Write and revise shoot-ready scenes", icon: PenLine },
    { title: "Storyboard", description: "Generate keyframes and shot cards", icon: Clapperboard },
    { title: "Full Auto", description: "Let the agent run the workflow", icon: Zap },
]

export default function LandingPage() {
    const { user, signInWithGoogle } = useAuth()
    const [adminShowcase, setAdminShowcase] = useState(mockShowcase)
    const [courses, setCourses] = useState<any[]>([])
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const [showcaseRes, coursesRes] = await Promise.all([
                    supabase
                        .from("showcase_items")
                        .select("*")
                        .order("created_at", { ascending: false }),
                    supabase
                        .from("courses")
                        .select("*")
                        .order("created_at", { ascending: true })
                        .limit(4),
                ])
                if (!showcaseRes.error && showcaseRes.data) {
                    setAdminShowcase(showcaseRes.data.map((s: any) => ({
                        id: s.id,
                        title: s.title,
                        description: s.description,
                        thumbnail: s.thumbnail || "",
                        videoUrl: s.video_url || "",
                    })))
                }
                if (!coursesRes.error && coursesRes.data) {
                    setCourses(coursesRes.data.filter((c: any) => !c.is_paused))
                }
            } catch {}
        }
        load()
    }, [])

    const heroShowcase = adminShowcase.slice(0, 3)
    const galleryItems = useMemo(() => {
        const realItems = adminShowcase.slice(0, 6).map((item, index) => ({
            title: item.title,
            description: item.description || "AI Director Hub creation",
            thumbnail: item.thumbnail,
            videoUrl: item.videoUrl,
            fallback: galleryFallbacks[index % galleryFallbacks.length][2],
        }))
        const fillers = galleryFallbacks.slice(realItems.length).map(([title, description, fallback]) => ({
            title,
            description,
            thumbnail: "",
            videoUrl: "",
            fallback,
        }))
        return [...realItems, ...fillers].slice(0, 6)
    }, [adminShowcase])

    const openStudio = user ? "/studio" : undefined

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
                            "AI Director Hub is an AI video and image creation studio with an AI Director agent that turns simple requests into scripts, assets, storyboards, images, and full videos.",
                        sameAs: [],
                    }),
                }}
            />
            <Navbar />

            {/* Navbar is fixed and owns the membership offer. Reserve room for it
                before the homepage content so it never overlaps the hero. */}
            <div className="h-28" aria-hidden="true" />

            <section className="mx-auto max-w-[1540px] px-4 pb-10 pt-5 md:px-6">
                <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#111312] p-5 md:p-8"
                    >
                        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(181,255,22,.16),transparent_35%,rgba(64,202,255,.1)_78%)]" />
                        <div className="relative z-10 flex min-h-[520px] flex-col justify-between">
                            <div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold uppercase tracking-[.18em] text-primary">
                                    <Sparkles className="h-4 w-4" />
                                    Your AI creative employee
                                </div>
                                <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[.9] tracking-tight md:text-7xl lg:text-8xl">
                                    Create AI videos and images with an AI Director.
                                </h1>
                                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/60">
                                    Ask for a product ad, short film, reel, music visual, or episode. The Director writes, plans,
                                    organizes assets, makes storyboards, generates images, and prepares video with approvals.
                                </p>
                            </div>

                            <div className="mt-10 grid gap-3 sm:grid-cols-2">
                                {user ? (
                                    <Link href="/studio" className="btn-primary flex items-center justify-center gap-2 py-4 text-base">
                                        Start Creating <ArrowRight className="h-5 w-5" />
                                    </Link>
                                ) : (
                                    <button onClick={signInWithGoogle} className="btn-primary flex items-center justify-center gap-2 py-4 text-base">
                                        Start Creating Free <ArrowRight className="h-5 w-5" />
                                    </button>
                                )}
                                <Link href="/billing" className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[.05] px-6 py-4 font-bold text-white transition hover:border-primary/50 hover:text-primary">
                                    View Plans <ArrowUpRight className="h-5 w-5" />
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                    <div className="grid gap-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            {heroShowcase.length > 0 ? heroShowcase.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => item.videoUrl && setPlayingVideo({ url: item.videoUrl, title: item.title })}
                                    className={cn(
                                        "group relative min-h-[250px] overflow-hidden rounded-[24px] border border-white/10 bg-[#151716] text-left",
                                        index === 0 && "md:col-span-2",
                                    )}
                                >
                                    {item.thumbnail ? (
                                        <img src={item.thumbnail} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                                    ) : item.videoUrl ? (
                                        <video src={`${item.videoUrl}#t=0.1`} muted preload="metadata" playsInline className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                                    ) : (
                                        <div className={cn("absolute inset-0", galleryFallbacks[index][2])} />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                    <div className="absolute bottom-0 left-0 right-0 p-5">
                                        <div className="mb-3 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-black text-black">Video</div>
                                        <h2 className="text-2xl font-black">{item.title}</h2>
                                        <p className="mt-2 line-clamp-2 text-sm text-white/60">{item.description}</p>
                                    </div>
                                    {item.videoUrl && (
                                        <span className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full bg-primary text-black transition group-hover:scale-105">
                                            <Play className="h-5 w-5 fill-black" />
                                        </span>
                                    )}
                                </button>
                            )) : galleryFallbacks.slice(0, 3).map(([title, description, fallback], index) => (
                                <div key={title} className={cn("relative min-h-[250px] overflow-hidden rounded-[24px] border border-white/10 p-5", fallback, index === 0 && "md:col-span-2")}>
                                    <div className="absolute inset-x-5 bottom-5">
                                        <div className="mb-3 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-black text-black">Studio</div>
                                        <h2 className="text-2xl font-black">{title}</h2>
                                        <p className="mt-2 text-sm text-white/65">{description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            {productionCards.map((card) => (
                                <Link key={card.title} href="/studio" className="rounded-[20px] border border-white/10 bg-white/[.05] p-5 transition hover:border-primary/50 hover:bg-primary/[.08]">
                                    <card.icon className="h-6 w-6 text-primary" />
                                    <h3 className="mt-5 text-lg font-black">{card.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-white/50">{card.description}</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1540px] px-4 py-8 md:px-6">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[.22em] text-primary">Create gallery</p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">What your AI Director can make</h2>
                    </div>
                    <Link href="/studio" className="hidden items-center gap-2 text-sm font-bold text-primary hover:underline md:flex">
                        Open Studio <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
                <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                    {galleryItems.map((item, index) => (
                        <button
                            key={`${item.title}-${index}`}
                            type="button"
                            onClick={() => item.videoUrl && setPlayingVideo({ url: item.videoUrl, title: item.title })}
                            className={cn(
                                "group relative overflow-hidden rounded-[22px] border border-white/10 bg-[#121412] text-left",
                                index === 0 && "md:col-span-2 md:row-span-2",
                                index === 3 && "md:row-span-2",
                            )}
                        >
                            {item.thumbnail ? (
                                <img src={item.thumbnail} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                            ) : (
                                <div className={cn("absolute inset-0", item.fallback)} />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-5">
                                <h3 className="text-xl font-black">{item.title}</h3>
                                <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/55">{item.description}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-[1540px] px-4 py-12 md:px-6">
                <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
                    <div className="rounded-[28px] border border-primary/25 bg-primary p-8 text-black">
                        <p className="text-xs font-black uppercase tracking-[.24em]">AI employee</p>
                        <h2 className="mt-4 text-4xl font-black leading-none md:text-6xl">One agent. Full creative workflow.</h2>
                        <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-black/65">
                            Your Director can read and update scripts, assets, storyboard images, uploaded references, and video plans from chat.
                        </p>
                        <div className="mt-8 grid gap-3 sm:grid-cols-2">
                            {["Image generation can run instantly", "Video generation asks for approval", "Full-auto mode can run end to end", "Workflow skills guide each episode"].map((item) => (
                                <div key={item} className="rounded-2xl bg-black/10 p-4 text-sm font-bold">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {featureCards.map((feature) => (
                            <Link
                                key={feature.title}
                                href={openStudio || "/studio"}
                                onClick={(event) => {
                                    if (!user) {
                                        event.preventDefault()
                                        signInWithGoogle()
                                    }
                                }}
                                className="group rounded-[24px] border border-white/10 bg-[#141615] p-5 transition hover:border-primary/50"
                            >
                                <div className={cn("rounded-2xl bg-gradient-to-br p-4", feature.accent)}>
                                    <feature.icon className="h-7 w-7 text-primary" />
                                </div>
                                <h3 className="mt-5 text-xl font-black">{feature.title}</h3>
                                <p className="mt-3 text-sm leading-6 text-white/55">{feature.description}</p>
                                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary">
                                    Use it <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1540px] px-4 py-12 md:px-6">
                <div className="rounded-[28px] border border-white/10 bg-[#111312] p-5 md:p-8">
                    <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.22em] text-primary">Workflow</p>
                            <h2 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">From request to final video.</h2>
                            <p className="mt-5 text-white/55 leading-7">
                                Choose a workflow once in settings and apply it to the full storyboard of an episode.
                                Change it any time when the creative direction changes.
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                            {workflowSteps.map(([step, title, description]) => (
                                <div key={step} className="relative min-h-[260px] rounded-[22px] border border-white/10 bg-white/[.04] p-5">
                                    <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-lg font-black text-primary">{step}</div>
                                    <h3 className="mt-14 text-xl font-black">{title}</h3>
                                    <p className="mt-3 text-sm leading-6 text-white/50">{description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {courses.length > 0 && (
                <section className="mx-auto max-w-[1540px] px-4 py-12 md:px-6">
                    <div className="mb-6 flex items-end justify-between gap-4">
                        <div>
                            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Watch and learn</h2>
                            <p className="mt-3 text-white/55">Training for AI filmmaking, prompting, storyboard workflows, and creator systems.</p>
                        </div>
                        <Link href="/courses" className="hidden items-center gap-2 text-sm font-bold text-primary hover:underline md:flex">
                            View courses <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                        {courses.map((course) => (
                            <Link key={course.id} href={`/courses/${course.id}`} className="group overflow-hidden rounded-[24px] border border-white/10 bg-[#141615] transition hover:border-primary/50">
                                <div className="relative aspect-[16/10] bg-white/[.04]">
                                    {course.thumbnail ? (
                                        <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                                    ) : (
                                        <div className="h-full w-full bg-[linear-gradient(135deg,#151715,#33400d,#b9ff18)]" />
                                    )}
                                    <div className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-black text-black">{course.level || "Course"}</div>
                                </div>
                                <div className="p-5">
                                    <h3 className="line-clamp-2 text-lg font-black">{course.title}</h3>
                                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/50">{course.description}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <section className="mx-auto max-w-[1540px] px-4 py-12 md:px-6">
                <div className="rounded-[28px] border border-white/10 bg-[#111312] p-8 text-center md:p-12">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary text-black">
                        <Plus className="h-8 w-8" />
                    </div>
                    <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">Build your first AI video with a chat request.</h2>
                    <p className="mx-auto mt-5 max-w-2xl text-white/55">
                        Upload references, ask the Director for a script, generate images instantly, approve videos when ready, and keep the whole episode organized.
                    </p>
                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        {user ? (
                            <Link href="/studio" className="btn-primary px-8 py-4">Open AI Director Studio</Link>
                        ) : (
                            <button onClick={signInWithGoogle} className="btn-primary px-8 py-4">Start free</button>
                        )}
                        <Link href="/billing" className="rounded-2xl border border-white/15 px-8 py-4 font-bold text-white transition hover:border-primary/50 hover:text-primary">See credits and plans</Link>
                    </div>
                </div>
            </section>

            <section className="border-y border-white/5 bg-white/[0.02] py-8">
                <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-6 text-sm font-black uppercase tracking-[.18em] text-white/35">
                    <span>AI Director Agent</span>
                    <span>Image Generation</span>
                    <span>Storyboard Workflow</span>
                    <span>Video Approvals</span>
                    <span>Voice Control</span>
                </div>
            </section>

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
