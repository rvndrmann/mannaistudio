"use client"

import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { fetchMyMembership, isMembershipActive, membershipPlan } from "@/lib/membership"
import { CheckCircle2, CreditCard, Loader2, Lock, Play, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

export default function BillingPage() {
    const { user, loading, signInWithGoogle } = useAuth()
    const [membership, setMembership] = useState<any>(null)
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [isCheckingOut, setIsCheckingOut] = useState(false)

    useEffect(() => {
        const load = async () => {
            if (!user) {
                setIsLoadingPlan(false)
                return
            }

            const supabase = createClient()
            setMembership(await fetchMyMembership(supabase, user.id))
            setIsLoadingPlan(false)
        }

        if (!loading) load()
    }, [user, loading])

    const active = isMembershipActive(membership)
    const expiresAt = membership?.membership_expires_at
        ? new Date(membership.membership_expires_at).toLocaleDateString()
        : ""

    const handleCheckout = async () => {
        if (!user) {
            signInWithGoogle()
            return
        }

        setIsCheckingOut(true)
        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productType: 'membership',
                    price: String(membershipPlan.price),
                    userEmail: user.email,
                    userName: user.user_metadata?.full_name || 'Student',
                }),
            })

            const payuData = await res.json()
            const form = document.createElement('form')
            form.method = 'POST'
            form.action = 'https://secure.payu.in/_payment'

            Object.entries(payuData).forEach(([key, value]) => {
                const input = document.createElement('input')
                input.type = 'hidden'
                input.name = key
                input.value = value as string
                form.appendChild(input)
            })

            ;['surl', 'furl'].forEach((name) => {
                const input = document.createElement('input')
                input.type = 'hidden'
                input.name = name
                input.value = `${window.location.origin}/api/payu/webhook`
                form.appendChild(input)
            })

            document.body.appendChild(form)
            form.submit()
        } catch {
            setIsCheckingOut(false)
        }
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />
            <section className="pt-32 px-6 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
                <div className="space-y-6">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Plan & Billing</p>
                        <h1 className="text-4xl font-bold tracking-tight">AI Mastery Pro</h1>
                        <p className="text-white/50 mt-3 max-w-2xl">One monthly membership for premium course access and a larger creator portfolio.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { icon: Play, title: "Paid course access", text: "Unlock premium lessons while your plan is active." },
                            { icon: Sparkles, title: "10 portfolio videos", text: "Members can showcase up to 10 works." },
                            { icon: Lock, title: "Free limit: 2 videos", text: "Non-members can still post 2 portfolio videos." },
                        ].map((item) => (
                            <div key={item.title} className="glass-card p-5 rounded-2xl border-white/10">
                                <item.icon className="w-5 h-5 text-primary mb-4" />
                                <h2 className="font-bold">{item.title}</h2>
                                <p className="text-sm text-white/40 mt-2">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold">{membershipPlan.name}</h2>
                            <p className="text-sm text-white/40 mt-1">Monthly membership</p>
                        </div>
                        <CheckCircle2 className={active ? "w-6 h-6 text-emerald-400" : "w-6 h-6 text-white/30"} />
                    </div>

                    <div>
                        <span className="text-4xl font-bold">₹{membershipPlan.price}</span>
                        <span className="text-white/40"> / month</span>
                    </div>

                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        {loading || isLoadingPlan ? (
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <Loader2 className="w-4 h-4 animate-spin" /> Checking plan
                            </div>
                        ) : active ? (
                            <p className="text-sm text-emerald-300">Active membership{expiresAt ? ` until ${expiresAt}` : ""}.</p>
                        ) : (
                            <p className="text-sm text-white/50">You are on the free plan. Portfolio limit is {membershipPlan.freePortfolioLimit} videos.</p>
                        )}
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={isCheckingOut || loading || isLoadingPlan}
                        className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60"
                    >
                        {isCheckingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        {active ? "Renew Membership" : user ? "Start Membership" : "Sign In to Subscribe"}
                    </button>
                </div>
            </section>
        </main>
    )
}
