"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Clapperboard, Play, Zap, User, Menu, X, ShieldCheck, LogIn, LogOut, Loader2, CreditCard, MessageSquare, BookOpen } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import NotificationBell from "@/components/NotificationBell"
import { createClient } from "@/lib/supabase/client"
import { defaultBillingSettings, fetchBillingSettings, isAdminUser } from "@/lib/membership"

const baseNavLinks = [
    // Paused for now (re-enable by uncommenting):
    // { name: "Feed", href: "/feed", icon: Clapperboard },
    { name: "Courses", href: "/courses", icon: Play },
    { name: "Blog", href: "/blog", icon: BookOpen },
    // { name: "Challenges", href: "/challenges", icon: Zap },
    { name: "Billing", href: "/billing", icon: CreditCard },
    // { name: "AI Jobs", href: "/services", icon: ShieldCheck },
    // { name: "Messages", href: "/messages", icon: MessageSquare },
]

const adminLink = { name: "Admin", href: "/admin", icon: ShieldCheck }

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [offerText, setOfferText] = useState("")
    const { user, loading, signInWithGoogle, signOut } = useAuth()

    useEffect(() => {
        if (!user) { setIsAdmin(false); return }
        const supabase = createClient()
        isAdminUser(supabase, user.id).then(setIsAdmin)
    }, [user])

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await fetchBillingSettings(createClient())
                setOfferText(settings.offerEnabled ? settings.offerText : "")
            } catch {
                setOfferText(defaultBillingSettings.offerEnabled ? defaultBillingSettings.offerText : "")
            }
        }
        loadSettings()
    }, [])

    const navLinks = isAdmin ? [...baseNavLinks, adminLink] : baseNavLinks

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4">
            {offerText && (
                <div className="absolute left-0 right-0 top-0 bg-primary px-4 py-1 text-center text-xs font-bold text-black">
                    {offerText}
                </div>
            )}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={cn(
                    "glass flex items-center justify-between w-full max-w-6xl px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-xl bg-white/5",
                    offerText && "mt-6"
                )}
            >
                <Link href="/" className="flex items-center gap-2.5 group">
                    <img src="/logo.png" alt="AI Director Hub" className="w-10 h-10 rounded-full group-hover:scale-105 transition-transform" />
                    <span className="text-xl font-bold tracking-tight text-white">AI Director <span className="text-primary">Hub</span></span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {user && navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            className="text-sm font-medium text-white/70 hover:text-white transition-colors"
                        >
                            {link.name}
                        </Link>
                    ))}

                    {loading ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl">
                            <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                        </div>
                    ) : user ? (
                        <div className="flex items-center gap-3">
                            <NotificationBell />
                            <Link href="/profile" className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all group">
                                {user.user_metadata?.avatar_url ? (
                                    <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-5 h-5 rounded-full" />
                                ) : (
                                    <User className="w-4 h-4 text-white/70 group-hover:text-white" />
                                )}
                                <span className="text-sm font-medium">{user.user_metadata?.full_name?.split(' ')[0] || 'Profile'}</span>
                            </Link>
                            <button
                                onClick={signOut}
                                className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                                title="Sign Out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary/30 rounded-xl hover:bg-primary/30 transition-all group"
                        >
                            <LogIn className="w-4 h-4 text-primary group-hover:text-white" />
                            <span className="text-sm font-medium text-primary group-hover:text-white">Sign In</span>
                        </Link>
                    )}
                </div>

                {/* Mobile Toggle */}
                <button className="md:hidden text-white" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? <X /> : <Menu />}
                </button>
            </motion.div>

            {/* Mobile Menu */}
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="md:hidden absolute top-20 left-4 right-4 glass p-6 rounded-2xl border border-white/10 flex flex-col gap-4"
                >
                    {user && navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-3 text-lg font-medium text-white/70"
                        >
                            <link.icon className="w-5 h-5 text-primary" />
                            {link.name}
                        </Link>
                    ))}
                    <div className="border-t border-white/10 pt-4 mt-2">
                        {user ? (
                            <div className="flex flex-col gap-3">
                                <Link href="/profile" onClick={() => setIsOpen(false)} className="flex items-center gap-3 text-lg font-medium text-white/70">
                                    <User className="w-5 h-5 text-primary" />
                                    Profile
                                </Link>
                                <button onClick={() => { signOut(); setIsOpen(false); }} className="flex items-center gap-3 text-lg font-medium text-red-400">
                                    <LogOut className="w-5 h-5" />
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <Link href="/login" onClick={() => setIsOpen(false)} className="flex items-center gap-3 text-lg font-medium text-primary">
                                <LogIn className="w-5 h-5" />
                                Sign In
                            </Link>
                        )}
                    </div>
                </motion.div>
            )}
        </nav>
    )
}
