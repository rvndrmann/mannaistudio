import Footer from "@/components/Footer"
import Navbar from "@/components/Navbar"
import { BadgeCheck, Bot, Clapperboard, Image as ImageIcon, Layers3, Mail, MapPin, Mic2, PlugZap, ShieldCheck, Sparkles, Video, Wand2, Zap } from "lucide-react"
import Link from "next/link"

export const metadata = {
    title: "About Us | AI Director Hub",
    description: "AI Director Hub is an AI video and image creation studio with an AI Director agent for scripts, assets, storyboards, voice workflows, MCP/CLI access, and full video production.",
}

const pillars = [
    { icon: Bot, title: "AI Director Agent", text: "A creative employee inside your studio that can plan, write, revise, organize, and guide the whole production workflow." },
    { icon: ImageIcon, title: "AI Images", text: "Generate character references, product visuals, storyboard keyframes, thumbnails, and campaign assets from chat." },
    { icon: Video, title: "AI Video", text: "Prepare video generations from storyboard shots and references with approval-first controls or full-auto mode." },
    { icon: Layers3, title: "Assets & Storyboards", text: "Keep scripts, assets, uploaded media, storyboard images, prompts, and video outputs connected to each episode." },
]

const workflow = [
    "Chat or speak with the Director",
    "Create script, characters, assets, and storyboard shots",
    "Generate images immediately when requested",
    "Ask for approval before video generation unless full-auto is enabled",
    "Use workflow skills for continuity, storyboard image style, and video production",
    "Connect from the web app, MCP, CLI, or external AI chat clients",
]

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-[#070806] text-white">
            <Navbar />

            <section className="mx-auto max-w-[1200px] px-6 pb-16 pt-32">
                <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-black uppercase tracking-[.18em] text-primary">
                            <Sparkles className="h-4 w-4" />
                            About AI Director Hub
                        </div>
                        <h1 className="mt-6 text-5xl font-black leading-none tracking-tight md:text-7xl">
                            We are building an AI creative employee for video production.
                        </h1>
                        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/55">
                            AI Director Hub helps creators go from a simple request to scripts, reusable assets,
                            storyboard images, AI-generated visuals, video plans, approvals, and full production workflows.
                            The goal is simple: make AI video creation feel like working with a director, not fighting with a prompt box.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link href="/studio" className="btn-primary px-7 py-4 text-center font-black">
                                Open Studio
                            </Link>
                            <Link href="/billing" className="rounded-2xl border border-white/15 px-7 py-4 text-center font-black transition hover:border-primary hover:text-primary">
                                View Plans
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-primary/25 bg-[radial-gradient(circle_at_70%_18%,rgba(185,255,24,.22),transparent_28%),linear-gradient(145deg,#151815,#0b0d0c)] p-6">
                        <p className="text-xs font-black uppercase tracking-[.22em] text-primary">What the agent can touch</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {["Script", "Assets", "Storyboard", "Images", "Video", "References", "Voice", "Workflows"].map((item) => (
                                <div key={item} className="rounded-2xl border border-white/10 bg-white/[.05] p-4 text-sm font-black">
                                    {item}
                                </div>
                            ))}
                        </div>
                        <p className="mt-6 text-sm leading-6 text-white/50">
                            Image generation can run directly when the user asks. Video generation is approval-first,
                            and full-auto mode is available when the creator chooses to let the agent run end to end.
                        </p>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1200px] px-6 py-12">
                <div className="grid gap-4 md:grid-cols-4">
                    {pillars.map((item) => (
                        <div key={item.title} className="rounded-[24px] border border-white/10 bg-[#111312] p-5">
                            <item.icon className="h-7 w-7 text-primary" />
                            <h2 className="mt-5 text-xl font-black">{item.title}</h2>
                            <p className="mt-3 text-sm leading-6 text-white/50">{item.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-[1200px] px-6 py-12">
                <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
                    <div className="rounded-[28px] border border-white/10 bg-[#111312] p-8">
                        <Wand2 className="h-8 w-8 text-primary" />
                        <h2 className="mt-5 text-4xl font-black tracking-tight">What we are making</h2>
                        <p className="mt-4 leading-7 text-white/55">
                            We are building a chat-first AI production system where creators can control a full video
                            workflow from natural language. The Director can read context, suggest edits, prepare
                            generation, organize uploaded media, and keep the storyboard connected to the final clips.
                        </p>
                        <p className="mt-4 leading-7 text-white/55">
                            Training still matters, so courses and resources support the Studio, but the core product is
                            now the AI Director agent and creation workflow.
                        </p>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-white/[.04] p-8">
                        <h2 className="text-3xl font-black tracking-tight">How the workflow works</h2>
                        <div className="mt-6 space-y-3">
                            {workflow.map((item, index) => (
                                <div key={item} className="flex items-start gap-4 rounded-2xl bg-black/25 p-4">
                                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-black">{index + 1}</div>
                                    <p className="text-sm font-semibold leading-6 text-white/70">{item}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1200px] px-6 py-12">
                <div className="rounded-[28px] border border-primary/25 bg-primary p-8 text-black md:p-10">
                    <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.22em]">External access</p>
                            <h2 className="mt-4 text-4xl font-black leading-none md:text-5xl">Use the Director from your own AI chat.</h2>
                            <p className="mt-4 font-semibold leading-7 text-black/65">
                                With MCP and CLI access, users can connect their AI Director Hub project to Claude, ChatGPT-style clients, or terminal workflows.
                            </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {[
                                { icon: PlugZap, title: "MCP", text: "Expose project tools to MCP-capable clients." },
                                { icon: Mic2, title: "Voice", text: "Control workflow by speaking with the agent." },
                                { icon: ShieldCheck, title: "Approvals", text: "Keep costly video actions under user control." },
                            ].map((item) => (
                                <div key={item.title} className="rounded-2xl bg-black/10 p-5">
                                    <item.icon className="h-6 w-6" />
                                    <h3 className="mt-5 font-black">{item.title}</h3>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-black/60">{item.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1200px] px-6 py-12">
                <div className="grid gap-5 md:grid-cols-3">
                    {[
                        { icon: Zap, title: "For creators", text: "Turn simple requests into ads, reels, story videos, product visuals, and short-form campaigns." },
                        { icon: Clapperboard, title: "For productions", text: "Keep continuity across characters, storyboard images, references, prompts, and generated clips." },
                        { icon: BadgeCheck, title: "For learning", text: "Use courses and workflow instructions to understand the systems behind strong AI films." },
                    ].map((item) => (
                        <div key={item.title} className="rounded-[24px] border border-white/10 bg-[#111312] p-6">
                            <item.icon className="h-7 w-7 text-primary" />
                            <h2 className="mt-5 text-2xl font-black">{item.title}</h2>
                            <p className="mt-3 text-sm leading-6 text-white/50">{item.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-[1200px] px-6 py-12">
                <div className="rounded-[28px] border border-white/10 bg-[#111312] p-8">
                    <h2 className="text-3xl font-black tracking-tight">Registered Business Details</h2>
                    <div className="mt-6 grid gap-4 text-sm text-white/60 md:grid-cols-2">
                        <p><strong className="text-white">Legal Name:</strong> AIDIRECTORHUB</p>
                        <p><strong className="text-white">Proprietor:</strong> Ravinder Deep Singh</p>
                        <p><strong className="text-white">Udyam Registration No.:</strong> UDYAM-HR-13-0038483</p>
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-white/30" />
                            <a href="mailto:rvndr.mann@gmail.com" className="text-primary hover:underline">rvndr.mann@gmail.com</a>
                        </div>
                        <div className="flex items-start gap-2 md:col-span-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                            <p>VPO Barwala, Panchkula, Haryana - 134118, India</p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </main>
    )
}
