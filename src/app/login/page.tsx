"use client"

import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { LogIn } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

function LoginInner() {
    const { user, loading, signInWithGoogle } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = searchParams.get("next") || "/courses"

    useEffect(() => {
        if (!loading && user) router.replace(next)
    }, [user, loading, router, next])

    return (
        <main className="min-h-screen">
            <Navbar />
            <section className="pt-32 pb-20 px-6 max-w-md mx-auto">
                <div className="glass-card p-8 rounded-2xl border-white/10">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center mb-5">
                            <LogIn className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Welcome to AI Director Hub</h1>
                        <p className="text-white/50 text-sm mt-2">Free account — post jobs &amp; build your portfolio free. Every new account gets 20 free bids to start.</p>
                    </div>

                    <button
                        onClick={signInWithGoogle}
                        className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors font-medium"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        Continue with Google
                    </button>

                    <p className="text-center text-xs text-white/30 mt-6">
                        By continuing you agree to our <a href="/terms" className="text-primary hover:underline">Terms</a> and <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
                    </p>
                </div>
            </section>
        </main>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<main className="min-h-screen"><Navbar /></main>}>
            <LoginInner />
        </Suspense>
    )
}
