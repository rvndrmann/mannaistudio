"use client"

import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { Loader2, Mail, Lock, User, LogIn, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function LoginPage() {
    const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()
    const router = useRouter()
    const [mode, setMode] = useState<"signin" | "signup">("signin")
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [confirmSent, setConfirmSent] = useState(false)

    useEffect(() => {
        if (!loading && user) router.replace("/courses")
    }, [user, loading, router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        if (password.length < 6) {
            setError("Password must be at least 6 characters.")
            return
        }
        setSubmitting(true)
        if (mode === "signin") {
            const { error } = await signInWithEmail(email, password)
            if (error) setError(error)
            else router.replace("/courses")
        } else {
            if (!fullName.trim()) {
                setError("Please enter your name.")
                setSubmitting(false)
                return
            }
            const { error, needsConfirmation } = await signUpWithEmail(email, password, fullName)
            if (error) setError(error)
            else if (needsConfirmation) setConfirmSent(true)
            else router.replace("/courses")
        }
        setSubmitting(false)
    }

    return (
        <main className="min-h-screen">
            <Navbar />
            <section className="pt-32 pb-20 px-6 max-w-md mx-auto">
                {confirmSent ? (
                    <div className="glass-card p-10 rounded-2xl border-white/10 text-center space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-bold">Confirm your email</h1>
                        <p className="text-white/50 text-sm">
                            We sent a confirmation link to <strong className="text-white/80">{email}</strong>. Click it to activate your account, then sign in.
                        </p>
                        <button onClick={() => { setConfirmSent(false); setMode("signin") }} className="btn-primary w-full py-3">
                            Back to Sign In
                        </button>
                    </div>
                ) : (
                    <div className="glass-card p-8 rounded-2xl border-white/10">
                        <div className="text-center mb-6">
                            <h1 className="text-3xl font-bold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
                            <p className="text-white/50 text-sm mt-2">
                                {mode === "signin" ? "Sign in to access your courses and portfolio." : "Join AI Director Hub — free Pro access during early access."}
                            </p>
                        </div>

                        <button
                            onClick={signInWithGoogle}
                            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors font-medium mb-5"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Continue with Google
                        </button>

                        <div className="flex items-center gap-3 mb-5">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-xs text-white/30 uppercase tracking-wider">or</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === "signup" && (
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                    <input
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Full name"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary"
                                    />
                                </div>
                            )}
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email address"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password (min 6 characters)"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary"
                                />
                            </div>

                            {error && <p className="text-sm text-red-400">{error}</p>}

                            <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                                {mode === "signin" ? "Sign In" : "Create Account"}
                            </button>
                        </form>

                        <p className="text-center text-sm text-white/50 mt-6">
                            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
                            <button
                                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError("") }}
                                className="text-primary font-medium hover:underline"
                            >
                                {mode === "signin" ? "Sign up" : "Sign in"}
                            </button>
                        </p>
                    </div>
                )}
            </section>
        </main>
    )
}
