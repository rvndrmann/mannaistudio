"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { springUI, materialize } from "@/lib/motion"
import { Clapperboard, Play, User, ShieldCheck, LogIn, LogOut, Loader2, CreditCard, BookOpen, PlugZap, Sparkles, Users, KeyRound, ChevronDown, Menu } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { BillingModeToggle } from "@/components/studio/BillingModeToggle";
import CreditBadge from "@/components/CreditBadge"
import NotificationBell from "@/components/NotificationBell"
import { createClient } from "@/lib/supabase/client"
import { defaultBillingSettings, fetchBillingSettings, isAdminUser } from "@/lib/membership"
import { defaultSiteFeatures, fetchSiteFeatures, type SiteFeatures } from "@/lib/studio/feature-flags"

const baseNavLinks = [
    { key: "originals", name: "Originals", href: "/originals", icon: Clapperboard },
    { key: "social", name: "Social", href: "/social", icon: Play },
    { key: "calendar", name: "Calendar", href: "/calendar", icon: BookOpen },
    { key: "analytics", name: "Analytics", href: "/analytics", icon: CreditCard },
    { key: "ads", name: "Ads Manager", href: "/ads", icon: ShieldCheck },
    { key: "competitors", name: "Competitors", href: "/competitors", icon: ShieldCheck },
    { key: "courses", name: "AI Director Hub Academy", href: "/courses", icon: Play },
    { key: "blog", name: "Blog", href: "/blog", icon: BookOpen },
    { key: "billing", name: "Billing", href: "/billing", icon: CreditCard },
    { key: "mcp", name: "MCP & CLI", href: "/studio/external", icon: PlugZap },
]

const adminLink = { key: "admin", name: "Admin", href: "/admin", icon: ShieldCheck }

export default function Navbar() {
    const [isAdmin, setIsAdmin] = useState(false)
    const [offerText, setOfferText] = useState("")
    // null until the real setting arrives. Starting from the defaults — which
    // are all true — meant every page first painted the full nav and then
    // removed the paused links when the fetch landed, so a paused feature was
    // briefly clickable on every load.
    const [siteFeatures, setSiteFeatures] = useState<SiteFeatures | null>(null)
    const { user, loading, signInWithGoogle, signOut } = useAuth()
    const pathname = usePathname()
    const [moreOpen, setMoreOpen] = useState(false)
    const moreRef = useRef<HTMLDivElement>(null)

    // Originals is a viewing surface, and the full chrome — nine controls plus a
    // profile — crowded it enough that the avatar was cut off at the right edge.
    // Everything collapses behind one "More" button here, at every breakpoint.
    const compactHeader = pathname === "/originals" || pathname.startsWith("/originals/")

    useEffect(() => {
        if (!moreOpen) return
        const onPointerDown = (event: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMoreOpen(false)
        }
        document.addEventListener("mousedown", onPointerDown)
        document.addEventListener("keydown", onKeyDown)
        return () => {
            document.removeEventListener("mousedown", onPointerDown)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [moreOpen])

    // A menu left open across a navigation would sit over the new page.
    useEffect(() => { setMoreOpen(false) }, [pathname])

    useEffect(() => {
        if (!user) { setIsAdmin(false); return }
        const supabase = createClient()
        isAdminUser(supabase, user.id).then(setIsAdmin)
    }, [user])

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const supabase = createClient()
                const [settings, feats] = await Promise.all([
                    fetchBillingSettings(supabase),
                    fetchSiteFeatures(supabase),
                ])
                setOfferText(settings.offerEnabled ? settings.offerText : "")
                setSiteFeatures(feats)
            } catch {
                setOfferText(defaultBillingSettings.offerEnabled ? defaultBillingSettings.offerText : "")
                // Settings unreadable: fall back to the defaults rather than
                // leaving the nav permanently empty.
                setSiteFeatures(defaultSiteFeatures)
            }
        }
        loadSettings()
    }, [])

    // Nothing is shown until it is known what is paused: a nav that fills in a
    // beat late is better than one that offers a paused feature and retracts it.
    const activeBaseNavLinks = siteFeatures === null ? [] : baseNavLinks.filter((link) => {
        if (link.key in siteFeatures) {
            return (siteFeatures as any)[link.key] !== false
        }
        return true
    })

    const navLinks = isAdmin ? [...activeBaseNavLinks, adminLink] : activeBaseNavLinks

    // Originals is the one surface that works signed out — the catalogue is
    // public and the first episodes of every series play free, which is the
    // whole point of it. Hiding it behind sign-in would hide the thing the
    // sign-in is for. Everything else stays as it was.
    const visibleNavLinks = user ? navLinks : navLinks.filter((link) => link.key === "originals")

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4">
            {offerText && (
                <div className="absolute left-0 right-0 top-0 bg-primary px-4 py-1 text-center text-xs font-medium text-black">
                    {offerText}
                </div>
            )}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={springUI}
                className={cn(
                    // A floating island of material, not an opaque bar: the page
                    // scrolls underneath it and stays partly visible through it.
                    // gap-6 rather than justify-between alone: the right-hand cluster grew
                    // by two controls, and without a floor on the spacing the brand
                    // ends up touching the first nav link.
                    // Tighter on a phone: the bar carries the brand, Originals and the
                    // account controls at 375px, and gap-6 with px-6 spent 72px of
                    // that on air alone.
                    "material-chrome flex items-center justify-between gap-2 px-3 sm:gap-6 sm:px-6 w-full max-w-6xl py-3 rounded-lg",
                    offerText && "mt-6"
                )}
            >
                <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2.5 group">
                    <img src="/logo.png" alt="AI Director Hub" className="w-10 h-10 shrink-0 rounded-full transition-transform duration-press ease-out group-active:scale-95" />
                    <span className="hidden whitespace-nowrap text-xl font-semibold tracking-[-0.02em] text-white sm:inline">AI Director <span className="text-primary">Hub</span></span>
                </Link>

                {/* Originals, in the bar on a phone.
                    The nav links live in a md-and-up row, so on a narrow screen
                    the one destination this site is trying to send people to was
                    reachable only by opening More. It is the whole funnel, so it
                    gets a permanent seat. Hidden from md up, where the full nav
                    already carries it, and skipped on Originals itself. */}
                {!compactHeader && visibleNavLinks.some((link) => link.key === "originals") && (
                    <Link
                        href="/originals"
                        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm font-medium text-white/85 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97] md:hidden"
                    >
                        <Clapperboard className="h-4 w-4 shrink-0 text-primary" />
                        Originals
                    </Link>
                )}

                {/* Account controls, collapsed into one button at every width */}
                    <div className="order-last flex shrink-0 items-center gap-2">
                    {/* Signing in and out stays in the bar. Sign In is the whole
                        job of this page for a visitor, and hiding it a click
                        deep costs conversions; Sign Out is the one control
                        people look for by muscle memory. */}
                    {!loading && !user && (
                        <Link
                            href="/login"
                            className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
                        >
                            <LogIn className="h-4 w-4" />
                            Sign In
                        </Link>
                    )}

                    <div ref={moreRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setMoreOpen((open) => !open)}
                            aria-expanded={moreOpen}
                            aria-haspopup="menu"
                            className="flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 text-sm font-medium text-white/80 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97] sm:px-4"
                        >
                            {/* A hamburger on a phone, where the word would
                                cost the Originals button its seat in the bar. */}
                            <Menu className="h-4 w-4 sm:hidden" />
                            <span className="hidden sm:inline">More</span>
                            <ChevronDown className={cn("hidden h-4 w-4 transition-transform sm:block", moreOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                            {moreOpen && (
                                <motion.div
                                    {...materialize}
                                    style={{ transformOrigin: "top right" }}
                                    role="menu"
                                    // Near-opaque rather than the sheet's 82%: this menu sits over the
                                    // hero's bright credit pills, which showed straight through it.
                                    className="material-sheet absolute right-0 top-full z-50 mt-2 w-72 rounded-lg bg-[#0d0f0e] p-2"
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center py-6">
                                            <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                                        </div>
                                    ) : user ? (
                                        <>
                                            {/* Balance, alerts and avatar keep their own behaviour */}
                                            <div className="flex items-center justify-between gap-2 px-1 pb-2">
                                                <CreditBadge />
                                                <div className="flex items-center gap-2">
                                                    <NotificationBell />
                                                    <Link
                                                        href="/profile"
                                                        className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 transition hover:bg-white/20"
                                                    >
                                                        {user.user_metadata?.avatar_url ? (
                                                            <img src={user.user_metadata.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                                                        ) : (
                                                            <User className="h-4 w-4 text-white/70" />
                                                        )}
                                                    </Link>
                                                </div>
                                            </div>

                                            {/* Inline in the bar on wide screens
                                                everywhere but Originals, so they
                                                appear here only when they are not
                                                already visible. */}
                                            <div className={compactHeader ? "" : "md:hidden"}>
                                                <Link
                                                    href="/studio"
                                                    className="mb-1 flex min-h-[44px] items-center gap-2.5 rounded-md bg-primary px-3 text-sm font-semibold text-black transition hover:brightness-110"
                                                >
                                                    <Sparkles className="h-4 w-4" />
                                                    Creator Studio
                                                </Link>

                                                <div className="my-1 border-t border-white/10" />

                                                {navLinks.map((link) => (
                                                    <Link
                                                        key={link.name}
                                                        href={link.href}
                                                        className="flex min-h-[44px] items-center gap-2.5 rounded-md px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                                                    >
                                                        <link.icon className="h-4 w-4 text-primary" />
                                                        {link.name}
                                                    </Link>
                                                ))}
                                            </div>

                                            <div className="my-1 border-t border-white/10" />

                                            {/* Renders its own "My API" label, so it carries the row alone. */}
                                            <div className="flex min-h-[44px] items-center px-3">
                                                <BillingModeToggle compact />
                                            </div>
                                            <Link
                                                href="/studio/integrations"
                                                className="flex min-h-[44px] items-center gap-2.5 rounded-md px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                                            >
                                                <KeyRound className="h-4 w-4 text-primary" />
                                                API keys
                                            </Link>
                                            <Link
                                                href="/studio/team"
                                                className="flex min-h-[44px] items-center gap-2.5 rounded-md px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                                            >
                                                <Users className="h-4 w-4 text-primary" />
                                                Team
                                            </Link>

                                            <div className="my-1 border-t border-white/10" />

                                            <Link
                                                href="/profile"
                                                className="flex min-h-[44px] items-center gap-2.5 rounded-md px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                                            >
                                                <User className="h-4 w-4 text-primary" />
                                                Profile
                                            </Link>
                                        </>
                                    ) : (
                                        <p className="px-3 py-2 text-sm text-white/45">
                                            Sign in to buy credits and unlock episodes.
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {!loading && user && (
                        <button
                            onClick={signOut}
                            title="Sign Out"
                            className="flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-medium text-white/60 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Sign Out</span>
                        </button>
                    )}
                    </div>

                {/* Nav links and the studio CTA. The account controls all live
                    in the More menu above: eight chips in the bar overflowed the
                    right edge and clipped the avatar. */}
                {!compactHeader && (<>
                <div className="hidden md:flex shrink-0 items-center gap-5">
                    {visibleNavLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            className="text-sm font-medium text-white/70 hover:text-white transition-colors"
                        >
                            {link.name}
                        </Link>
                    ))}

                    {!loading && (
                        <Link
                            href="/studio"
                            className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
                        >
                            <Sparkles className="h-4 w-4" />
                            Creator Studio
                        </Link>
                    )}

                </div>

                </>)}
            </motion.div>

        </nav>
    )
}
