"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { springUI, materialize } from "@/lib/motion"
import { Clapperboard, Play, Zap, User, Menu, X, ShieldCheck, LogIn, LogOut, Loader2, CreditCard, MessageSquare, BookOpen, PlugZap, Sparkles, Users, KeyRound, ChevronDown} from "lucide-react"
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
    const [isOpen, setIsOpen] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [offerText, setOfferText] = useState("")
    const [siteFeatures, setSiteFeatures] = useState<SiteFeatures>(defaultSiteFeatures)
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
            }
        }
        loadSettings()
    }, [])

    const activeBaseNavLinks = baseNavLinks.filter((link) => {
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
                    "material-chrome flex items-center justify-between gap-6 w-full max-w-6xl px-6 py-3 rounded-lg",
                    offerText && "mt-6"
                )}
            >
                <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2.5 group">
                    <img src="/logo.png" alt="AI Director Hub" className="w-10 h-10 shrink-0 rounded-full transition-transform duration-press ease-out group-active:scale-95" />
                    <span className="whitespace-nowrap text-xl font-semibold tracking-[-0.02em] text-white">AI Director <span className="text-primary">Hub</span></span>
                </Link>

                {/* Originals: one button, everything behind it */}
                {compactHeader && (
                    <div className="flex shrink-0 items-center gap-2">
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
                            className="flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-white/80 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
                        >
                            More
                            <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
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
                )}

                {/* Desktop Nav — not rendered under the compact header, so the
                    credit badge and bell do not mount twice and poll twice. */}
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

                    {loading ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-md">
                            <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                        </div>
                    ) : user ? (
                        <div className="flex items-center gap-3">
                            <CreditBadge />
                            <BillingModeToggle compact />
                            {/* Next to the credit badge, because it is the
                                alternative to spending them: connect a key and
                                that provider stops costing credits. */}
                            <Link
                                href="/studio/integrations"
                                title="Use your own provider API keys instead of studio credits"
                                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 px-3 text-sm font-medium text-white/70 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
                            >
                                <KeyRound className="h-4 w-4 shrink-0" />
                                <span className="hidden xl:inline">API keys</span>
                            </Link>
                            <Link
                                href="/studio/team"
                                title="Add and manage team members"
                                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 px-3 text-sm font-medium text-white/70 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
                            >
                                <Users className="h-4 w-4 shrink-0" />
                                <span className="hidden xl:inline">Team</span>
                            </Link>
                            <NotificationBell />
                            <Link href="/profile" className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-md transition duration-press ease-out hover:bg-white/20 active:scale-[0.97] group">
                                {user.user_metadata?.avatar_url ? (
                                    <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-5 h-5 rounded-full" />
                                ) : (
                                    <User className="w-4 h-4 text-white/70 group-hover:text-white" />
                                )}
                                <span className="text-sm font-medium">{user.user_metadata?.full_name?.split(' ')[0] || 'Profile'}</span>
                            </Link>
                            <button
                                onClick={signOut}
                                className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 rounded-md transition duration-press ease-out active:scale-[0.97]"
                                title="Sign Out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center gap-2 px-4 py-2 border border-white/15 bg-white/[.04] rounded-md transition duration-press ease-out hover:bg-white/10 active:scale-[0.97] group"
                        >
                            <LogIn className="w-4 h-4 text-white/70 group-hover:text-white" />
                            <span className="text-sm font-medium text-white/80 group-hover:text-white">Sign In</span>
                        </Link>
                    )}
                </div>

                {/* Mobile Toggle */}
                <button
                    aria-label={isOpen ? "Close menu" : "Open menu"}
                    aria-expanded={isOpen}
                    className="md:hidden -mr-2.5 grid h-11 w-11 place-items-center text-white transition-transform duration-press ease-out active:scale-90"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <X /> : <Menu />}
                </button>
                </>)}
            </motion.div>

            {/* Mobile Menu */}
            <AnimatePresence>
            {isOpen && !compactHeader && (
                <motion.div
                    {...materialize}
                    style={{ transformOrigin: "top right" }}
                    className="md:hidden absolute top-20 left-4 right-4 material-sheet p-6 rounded-lg flex flex-col gap-4"
                >
                    {!loading && (
                        <Link
                            href="/studio"
                            onClick={() => setIsOpen(false)}
                            className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-primary"
                        >
                            <Sparkles className="h-5 w-5" />
                            Creator Studio
                        </Link>
                    )}
                    {visibleNavLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={() => setIsOpen(false)}
                            className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-white/70"
                        >
                            <link.icon className="w-5 h-5 text-primary" />
                            {link.name}
                        </Link>
                    ))}
                    <div className="border-t border-white/10 pt-4 mt-2">
                        {user ? (
                            <div className="flex flex-col gap-3">
                                <Link href="/studio/integrations" onClick={() => setIsOpen(false)} className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-white/70">
                                    <KeyRound className="h-5 w-5" />
                                    API keys
                                </Link>
                                <Link href="/profile" onClick={() => setIsOpen(false)} className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-white/70">
                                    <User className="w-5 h-5 text-primary" />
                                    Profile
                                </Link>
                                <button onClick={() => { signOut(); setIsOpen(false); }} className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-red-400">
                                    <LogOut className="w-5 h-5" />
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <Link href="/login" onClick={() => setIsOpen(false)} className="flex min-h-[44px] items-center gap-3 text-lg font-medium text-primary">
                                <LogIn className="w-5 h-5" />
                                Sign In
                            </Link>
                        )}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>
        </nav>
    )
}
