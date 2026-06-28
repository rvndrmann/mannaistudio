"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { defaultBillingSettings, fetchBillingSettings, fetchMyMembership, fetchMyPayments, getActivePlanPrice, isMembershipActive, membershipPlan, type PaymentRecord } from "@/lib/membership"
import { fbTrack } from "@/lib/fbpixel"
import Countdown from "@/components/Countdown"
import { CheckCircle2, CreditCard, Loader2, Lock, Play, Receipt, Sparkles, XCircle } from "lucide-react"
import { useEffect, useState } from "react"

export default function BillingPage() {
    const { user, loading, signInWithGoogle } = useAuth()
    const [membership, setMembership] = useState<any>(null)
    const [billingSettings, setBillingSettings] = useState(defaultBillingSettings)
    const [isLoadingPlan, setIsLoadingPlan] = useState(true)
    const [isCheckingOut, setIsCheckingOut] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [cancelMsg, setCancelMsg] = useState("")
    const [payments, setPayments] = useState<PaymentRecord[]>([])

    useEffect(() => {
        const load = async () => {
            if (!user) {
                setIsLoadingPlan(false)
                return
            }

            const supabase = createClient()
            const [nextMembership, nextSettings, nextPayments] = await Promise.all([
                fetchMyMembership(supabase, user.id),
                fetchBillingSettings(supabase),
                fetchMyPayments(supabase, user.id),
            ])
            setMembership(nextMembership)
            setBillingSettings(nextSettings)
            setPayments(nextPayments)
            setIsLoadingPlan(false)
        }

        if (!loading) load()
    }, [user, loading])

    const active = isMembershipActive(membership)
    const activePrice = getActivePlanPrice(billingSettings)
    const expiresAt = membership?.membership_expires_at
        ? new Date(membership.membership_expires_at).toLocaleDateString()
        : ""

    const loadRazorpayScript = () =>
        new Promise<boolean>((resolve) => {
            if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
            const script = document.createElement("script")
            script.src = "https://checkout.razorpay.com/v1/checkout.js"
            script.onload = () => resolve(true)
            script.onerror = () => resolve(false)
            document.body.appendChild(script)
        })

    const handleCancel = async () => {
        if (!window.confirm("Cancel your membership? You'll keep access until the end of your current paid period.")) return
        setIsCancelling(true)
        setCancelMsg("")
        try {
            const res = await fetch('/api/razorpay/subscription/cancel', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || "Could not cancel.")
            setCancelMsg("Subscription cancelled. You keep access until " + (expiresAt || "your period ends") + ".")
            setMembership((m: any) => ({ ...m, razorpay_subscription_id: null }))
        } catch (e: any) {
            setCancelMsg(e?.message || "Could not cancel subscription.")
        } finally {
            setIsCancelling(false)
        }
    }

    const handleCheckout = async () => {
        if (!user) {
            signInWithGoogle()
            return
        }

        setIsCheckingOut(true)
        fbTrack('InitiateCheckout', { content_name: billingSettings.planName, content_category: 'membership', value: activePrice, currency: 'INR' })
        try {
            const ok = await loadRazorpayScript()
            if (!ok) throw new Error("Failed to load payment gateway.")

            const res = await fetch('/api/razorpay/subscription', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || "Could not start subscription.")

            const rzp = new (window as any).Razorpay({
                key: data.keyId,
                subscription_id: data.subscriptionId,
                name: billingSettings.planName,
                description: "Monthly membership",
                prefill: { name: data.name, email: data.email },
                theme: { color: "#C4F52B" },
                handler: () => {
                    // Subscription authorised. Webhook activates membership; refresh shortly.
                    fbTrack('Subscribe', { value: activePrice, currency: 'INR', predicted_ltv: activePrice * 12 })
                    fbTrack('Purchase', { content_name: billingSettings.planName, content_category: 'membership', value: activePrice, currency: 'INR' })
                    window.location.href = "/billing?subscription=success"
                },
                modal: {
                    ondismiss: () => setIsCheckingOut(false),
                },
            })
            rzp.open()
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
                        <h1 className="text-4xl font-bold tracking-tight">{billingSettings.planName}</h1>
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

                    <div className="glass-card rounded-2xl border-white/10 overflow-hidden">
                        <div className="p-5 border-b border-white/5 flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-primary" />
                            <h2 className="font-bold">Payment History</h2>
                        </div>
                        {payments.length === 0 ? (
                            <p className="p-6 text-sm text-white/35">No payments yet. Your membership and course payments will appear here.</p>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {payments.map((payment) => (
                                    <div key={payment.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            {payment.status === "success" ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                            )}
                                            <div>
                                                <p className="text-sm font-bold">{payment.productInfo}</p>
                                                <p className="text-xs text-white/35 mt-0.5">
                                                    {new Date(payment.createdAt).toLocaleDateString()} • Txn {payment.txnid}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 md:text-right">
                                            <span className={payment.status === "success" ? "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-emerald-400/10 text-emerald-300" : "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-red-400/10 text-red-300"}>
                                                {payment.status === "success" ? "Paid" : "Failed"}
                                            </span>
                                            <p className="font-bold">₹{payment.amount}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold">{billingSettings.planName}</h2>
                            <p className="text-sm text-white/40 mt-1">Monthly membership</p>
                        </div>
                        <CheckCircle2 className={active ? "w-6 h-6 text-emerald-400" : "w-6 h-6 text-white/30"} />
                    </div>

                    <div>
                        {billingSettings.offerEnabled && (
                            <div className="mb-2 text-sm font-bold text-emerald-300">{billingSettings.offerText}</div>
                        )}
                        {billingSettings.offerEnabled && (
                            <span className="mr-3 text-xl font-bold text-white/30 line-through">₹{billingSettings.monthlyPrice}</span>
                        )}
                        <span className="text-4xl font-bold">₹{activePrice}</span>
                        <span className="text-white/40"> / month</span>
                    </div>

                    {billingSettings.offerEnabled && billingSettings.offerEndsAt && (
                        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-center">
                            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Offer ends in</p>
                            <Countdown endsAt={billingSettings.offerEndsAt} />
                        </div>
                    )}

                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        {loading || isLoadingPlan ? (
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <Loader2 className="w-4 h-4 animate-spin" /> Checking plan
                            </div>
                        ) : active ? (
                            <p className="text-sm text-emerald-300">
                                {membership?.is_trial ? "Free trial" : "Active membership"}{expiresAt ? ` until ${expiresAt}` : ""}.
                                {membership?.is_trial && " Upgrade to keep access after your trial ends."}
                            </p>
                        ) : (
                            <p className="text-sm text-white/50">You are on the free plan. Portfolio limit is {membershipPlan.freePortfolioLimit} videos.</p>
                        )}
                    </div>

                    {billingSettings.paymentsEnabled ? (
                        <button
                            onClick={handleCheckout}
                            disabled={isCheckingOut || loading || isLoadingPlan}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60"
                        >
                            {isCheckingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                            {active ? "Manage Subscription" : user ? "Subscribe Now" : "Sign In to Subscribe"}
                        </button>
                    ) : (
                        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
                            <p className="text-sm font-bold text-primary">Early Access — Free Pro!</p>
                            <p className="text-xs text-white/40 mt-1">Sign up now and enjoy free Pro access. Paid plans coming soon.</p>
                        </div>
                    )}

                    {active && !membership?.is_trial && membership?.razorpay_subscription_id && (
                        <button
                            onClick={handleCancel}
                            disabled={isCancelling}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60"
                        >
                            {isCancelling ? "Cancelling…" : "Cancel subscription"}
                        </button>
                    )}
                    {cancelMsg && <p className="text-xs text-center text-white/50">{cancelMsg}</p>}
                </div>
            </section>
            <Footer />
        </main>
    )
}
