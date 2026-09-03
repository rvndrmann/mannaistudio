"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import {
    Check,
    Clapperboard,
    Film,
    Loader2,
    LogIn,
    LogOut,
    Mail,
    MapPin,
    Play,
    Smartphone,
    Sparkles,
    User,
    X,
    Zap,
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import CreditPackModal from "@/components/originals/CreditPackModal"
import { ORIGINALS_CREDIT_PACKAGES, type OriginalsSeriesSummary } from "@/lib/originals"
import { formatUsdWithInr } from "@/lib/currency"

/**
 * The Originals landing page.
 *
 * Deliberately says nothing about Creator Studio, the AI Director, or the
 * models — this variant exists to find out whether the short-drama offer
 * converts on its own, and every sentence about making video is a sentence
 * asking the visitor to be a different kind of customer. It carries its own
 * header and footer for the same reason: the shared Navbar leads with a
 * "Creator Studio" button.
 *
 * The legal links and business details in the footer stay, because the page
 * takes payments and Razorpay requires them.
 */

const legalLinks = [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund", label: "Refund & Cancellation" },
    { href: "/contact", label: "Contact Us" },
]

export default function OriginalsHome() {
    const { user, loading, signInWithGoogle, signOut } = useAuth()
    const [series, setSeries] = useState<OriginalsSeriesSummary[]>([])
    const [credits, setCredits] = useState<number | null>(null)
    const [fetching, setFetching] = useState(true)
    const [showPacks, setShowPacks] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/originals", { cache: "no-store" })
                const data = await res.json()
                if (res.ok) {
                    setSeries(data.series || [])
                    setCredits(data.credits)
                }
            } catch {
                // An empty catalogue renders its own state; nothing to say here.
            } finally {
                setFetching(false)
            }
        }
        load()
    }, [user?.id])

    const featured = series[0] || null
    const rest = useMemo(() => series.slice(1), [series])
    const episodePrice = featured?.episodePrice ?? 20
    const freeEpisodes = featured?.freeEpisodes ?? 3

    return (
        <main className="min-h-screen bg-black text-white">
            {/* Header — viewer surfaces only */}
            <header className="fixed inset-x-0 top-0 z-50 flex justify-center p-4">
                <div className="material-chrome flex w-full max-w-6xl items-center justify-between gap-6 rounded-lg px-6 py-3">
                    <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2.5">
                        <img src="/logo.png" alt="AI Director Hub" className="h-10 w-10 shrink-0 rounded-full" />
                        <span className="whitespace-nowrap text-xl font-semibold tracking-[-0.02em]">
                            AI Director <span className="text-primary">Hub</span>
                        </span>
                    </Link>

                    <div className="flex shrink-0 items-center gap-3">
                        <Link
                            href="/originals"
                            className="hidden text-sm font-medium text-white/70 transition-colors hover:text-white sm:block"
                        >
                            Browse all
                        </Link>

                        {loading ? (
                            <div className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                            </div>
                        ) : user ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowPacks(true)}
                                    className="flex h-9 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 text-xs font-bold text-primary transition hover:bg-primary hover:text-black"
                                >
                                    <Zap className="h-3.5 w-3.5 fill-current" />
                                    {credits !== null ? credits.toLocaleString() : "…"}
                                </button>
                                <Link
                                    href="/profile"
                                    className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 transition hover:bg-white/20"
                                >
                                    {user.user_metadata?.avatar_url ? (
                                        <img src={user.user_metadata.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                                    ) : (
                                        <User className="h-4 w-4 text-white/70" />
                                    )}
                                    <span className="hidden text-sm font-medium sm:inline">
                                        {user.user_metadata?.full_name?.split(" ")[0] || "Profile"}
                                    </span>
                                </Link>
                                <button
                                    onClick={signOut}
                                    title="Sign out"
                                    className="rounded-md p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => signInWithGoogle()}
                                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                            >
                                <LogIn className="h-4 w-4" />
                                Sign in
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="relative overflow-hidden px-6 pb-16 pt-32">
                {featured?.posterUrl && (
                    <div className="absolute inset-0 -z-10">
                        <img src={featured.posterUrl} alt="" aria-hidden className="h-full w-full object-cover opacity-20 blur-3xl" />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
                    </div>
                )}

                <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
                    <div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            <Clapperboard className="h-3.5 w-3.5" />
                            AI Director Hub Originals
                        </span>

                        <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
                            Short drama.
                            <br />
                            <span className="text-primary">Made with AI.</span>
                        </h1>

                        <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
                            Vertical series you finish in one sitting. The first {freeEpisodes} episodes of every
                            series are free — no card, no subscription.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                href={featured ? `/originals/${featured.slug}` : "/originals"}
                                className="flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-black transition hover:brightness-110"
                            >
                                <Play className="h-4 w-4 fill-black" />
                                Start watching free
                            </Link>
                            <Link
                                href="/originals"
                                className="rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                            >
                                Browse all series
                            </Link>
                        </div>

                        <ul className="mt-8 space-y-2.5">
                            {[
                                `${freeEpisodes} free episodes on every series`,
                                `${episodePrice} credits per episode after that — yours to keep forever`,
                                "No subscription. Buy credits only when you want to.",
                            ].map((line) => (
                                <li key={line} className="flex items-start gap-2.5 text-sm text-white/55">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Featured poster */}
                    <div className="flex justify-center md:justify-end">
                        {featured ? (
                            <Link href={`/originals/${featured.slug}`} className="group relative block w-64 sm:w-72">
                                <div className="aspect-[9/16] overflow-hidden rounded-3xl border border-white/10 bg-[#111] shadow-2xl">
                                    {featured.posterUrl ? (
                                        <img
                                            src={featured.posterUrl}
                                            alt={featured.title}
                                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="grid h-full w-full place-items-center">
                                            <Film className="h-10 w-10 text-white/20" />
                                        </div>
                                    )}
                                </div>
                                <div className="absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-16">
                                    <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                                        Now playing
                                    </span>
                                    <p className="mt-2 text-lg font-semibold leading-tight">{featured.title}</p>
                                    <p className="mt-0.5 text-xs text-white/50">
                                        {featured.episodeCount} episodes{featured.genre ? ` · ${featured.genre}` : ""}
                                    </p>
                                </div>
                                <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                                    <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-black shadow-xl">
                                        <Play className="ml-1 h-6 w-6 fill-black" />
                                    </span>
                                </div>
                            </Link>
                        ) : (
                            <div className="grid aspect-[9/16] w-64 place-items-center rounded-3xl border border-white/10 bg-white/[0.02] sm:w-72">
                                <div className="text-center">
                                    <Smartphone className="mx-auto h-10 w-10 text-white/15" />
                                    <p className="mt-3 px-6 text-xs text-white/35">
                                        {fetching ? "Loading series…" : "First series dropping soon"}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Catalogue */}
            {rest.length > 0 && (
                <section className="px-6 py-12">
                    <div className="mx-auto max-w-6xl">
                        <div className="flex items-end justify-between">
                            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Keep watching</h2>
                            <Link href="/originals" className="text-sm font-medium text-primary hover:brightness-125">
                                See all →
                            </Link>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                            {rest.slice(0, 10).map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: Math.min(index * 0.04, 0.3) }}
                                >
                                    <Link href={`/originals/${item.slug}`} className="group block">
                                        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-[#111]">
                                            {item.posterUrl ? (
                                                <img
                                                    src={item.posterUrl}
                                                    alt={item.title}
                                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="grid h-full w-full place-items-center">
                                                    <Film className="h-7 w-7 text-white/20" />
                                                </div>
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-3 pt-10">
                                                <p className="line-clamp-2 text-sm font-semibold leading-tight">{item.title}</p>
                                                <p className="mt-1 text-[11px] text-white/50">{item.episodeCount} episodes</p>
                                            </div>
                                            <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                                                {item.freeEpisodes} free
                                            </span>
                                        </div>
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* How it works */}
            <section className="border-y border-white/[0.06] bg-white/[0.015] px-6 py-16">
                <div className="mx-auto max-w-5xl">
                    <h2 className="text-center text-2xl font-semibold tracking-[-0.02em]">How it works</h2>
                    <div className="mt-10 grid gap-8 md:grid-cols-3">
                        {[
                            { icon: Play, title: "Watch free", body: `Every series opens with ${freeEpisodes} free episodes. Sign in and press play.` },
                            { icon: Zap, title: "Unlock with credits", body: `Hooked? Each episode after that is ${episodePrice} credits. One tap, no subscription.` },
                            { icon: Check, title: "Keep it forever", body: "An unlocked episode stays unlocked. Rewatch it whenever you like." },
                        ].map((step, i) => (
                            <div key={step.title} className="text-center">
                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                                    <step.icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 font-semibold">
                                    <span className="text-white/30">{i + 1}. </span>
                                    {step.title}
                                </h3>
                                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/50">{step.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Credit packs */}
            <section className="px-6 py-16">
                <div className="mx-auto max-w-4xl">
                    <div className="text-center">
                        <h2 className="text-2xl font-semibold tracking-[-0.02em]">Credits, whenever you need them</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
                            No plans and no renewals. Buy a pack, unlock what you want, come back when you feel like it.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-4 sm:grid-cols-3">
                        {Object.entries(ORIGINALS_CREDIT_PACKAGES).map(([id, pack]) => {
                            const popular = id === "500"
                            return (
                                <div
                                    key={id}
                                    className={`relative rounded-2xl border p-6 text-center transition ${
                                        popular ? "border-primary bg-primary/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                                    }`}
                                >
                                    {popular && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                                            Best value
                                        </span>
                                    )}
                                    <p className="text-3xl font-semibold">{pack.credits.toLocaleString()}</p>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/40">credits</p>
                                    <p className="mt-4 text-lg font-semibold text-primary">{formatUsdWithInr(pack.priceInr)}</p>
                                    <p className="mt-1 text-xs text-white/45">
                                        about {Math.floor(pack.credits / episodePrice)} episodes
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => (user ? setShowPacks(true) : signInWithGoogle())}
                                        className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                                            popular
                                                ? "bg-primary text-black hover:brightness-110"
                                                : "border border-white/15 text-white/80 hover:bg-white/10 hover:text-white"
                                        }`}
                                    >
                                        {user ? "Buy pack" : "Sign in to buy"}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>

            {/* Closing CTA */}
            <section className="px-6 pb-20">
                <div className="mx-auto max-w-4xl rounded-3xl border border-primary/20 bg-primary/[0.04] px-8 py-14 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-primary" />
                    <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em]">Your next binge is {freeEpisodes} episodes free.</h2>
                    <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
                        Pick a series and press play. Nothing to cancel later.
                    </p>
                    <Link
                        href="/originals"
                        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-black transition hover:brightness-110"
                    >
                        <Play className="h-4 w-4 fill-black" />
                        Browse Originals
                    </Link>
                </div>
            </section>

            {/* Footer — legal and business details, required for payments */}
            <footer className="border-t border-white/10">
                <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <Link href="/" className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
                            <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" />
                            AI Director <span className="text-primary">Hub</span>
                        </Link>
                        <p className="text-sm leading-relaxed text-white/40">
                            Vertical short drama, made with AI. First {freeEpisodes} episodes of every series free.
                        </p>
                    </div>

                    <div>
                        <h3 className="mb-4 text-sm font-bold text-white/60">Legal</h3>
                        <ul className="space-y-1">
                            {legalLinks.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="flex min-h-[44px] items-center text-sm text-white/45 transition-colors hover:text-white sm:min-h-0 sm:py-1"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-4 text-sm font-bold text-white/60">Business Info</h3>
                        <div className="space-y-3 text-sm text-white/40">
                            <p className="font-bold text-white/60">AIDIRECTORHUB</p>
                            <p>Proprietor: Ravinder Deep Singh</p>
                            <div className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                                <p className="leading-relaxed">VPO Barwala, Panchkula, Haryana – 134118, India</p>
                            </div>
                            <p className="text-xs text-white/30">Udyam Reg: UDYAM-HR-13-0038483</p>
                            <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-white/30" />
                                <a href="mailto:rvndr.mann@gmail.com" className="hover:text-white">
                                    rvndr.mann@gmail.com
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/5 py-6 text-center text-xs text-white/25">
                    © {new Date().getFullYear()} AIDIRECTORHUB. All rights reserved. | Proprietor: Ravinder Deep Singh
                </div>
            </footer>

            <CreditPackModal
                open={showPacks}
                onClose={() => setShowPacks(false)}
                balance={credits}
                onPurchased={setCredits}
                episodePrice={episodePrice}
            />
        </main>
    )
}
