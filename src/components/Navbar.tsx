"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Play, Award, Zap, User, Menu, X, ShieldCheck, LogIn, LogOut, Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"

const navLinks = [
    { name: "Courses", href: "/courses", icon: Play },
    { name: "Challenges", href: "/challenges", icon: Zap },
    { name: "AI Services", href: "/services", icon: ShieldCheck },
    { name: "Admin", href: "/admin", icon: ShieldCheck },
]

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const { user, loading, signInWithGoogle, signOut } = useAuth()

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="glass flex items-center justify-between w-full max-w-6xl px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-xl bg-white/5"
            >
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="bg-primary/20 p-2 rounded-lg group-hover:bg-primary/30 transition-colors">
                        <Zap className="w-6 h-6 text-primary fill-primary/20" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">AI<span className="text-primary">Mastery</span></span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
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
                        <button
                            onClick={signInWithGoogle}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary/30 rounded-xl hover:bg-primary/30 transition-all group"
                        >
                            <LogIn className="w-4 h-4 text-primary group-hover:text-white" />
                            <span className="text-sm font-medium text-primary group-hover:text-white">Sign In</span>
                        </button>
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
                    {navLinks.map((link) => (
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
                            <button onClick={() => { signInWithGoogle(); setIsOpen(false); }} className="flex items-center gap-3 text-lg font-medium text-primary">
                                <LogIn className="w-5 h-5" />
                                Sign In with Google
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </nav>
    )
}
