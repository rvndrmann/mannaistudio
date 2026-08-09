"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { defaultBillingSettings, fetchBillingSettings, fetchMyMembership, fetchMyPayments, getActivePlanPrice, isMembershipActive, membershipPlan, type PaymentRecord } from "@/lib/membership"
import { fbTrack } from "@/lib/fbpixel"
import Countdown from "@/components/Countdown"
import { CheckCircle2, CreditCard, Loader2, Lock, Play, Receipt, Sparkles, XCircle, Zap, AlertTriangle } from "lucide-react"
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
    const [loadingCreditPkg, setLoadingCreditPkg] = useState<string | null>(null)
    const [creditMsg, setCreditMsg] = useState<string | null>(null)

    const reloadData = async () => {
        if (!user) return
        const supabase = createClient()
        const [nextMembership, nextSettings, nextPayments] = await Promise.all([
            fetchMyMembership(supabase, user.id),
            fetchBillingSettings(supabase),
            fetchMyPayments(supabase, user.id),
        ])
        setMembership(nextMembership)
        setBillingSettings(nextSettings)
        setPayments(nextPayments)
    }

    useEffect(() => {
        if (!loading) {
            reloadData().finally(() => setIsLoadingPlan(false))
        }
    }, [user, loading])

    const active = isMembershipActive(membership)
    const activePrice = getActivePlanPrice(billingSettings)
    const expiresAt = membership?.membership_expires_at
        ? new Date(membership.membership_expires_at).toLocaleDateString()
        : ""
    const creditBalance = typeof membership?.credits_balance === "number" ? membership.credits_balance : 0

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
            await reloadData()
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

    const handleCreditTopUp = async (packageId: string) => {
        if (!user) {
            signInWithGoogle()
            return
        }

        setLoadingCreditPkg(packageId)
        setCreditMsg(null)
        try {
            const ok = await loadRazorpayScript()
            if (!ok) throw new Error("Failed to load payment gateway.")

            const res = await fetch("/api/credits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packageId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Order creation failed")

            const rzp = new (window as any).Razorpay({
                key: data.keyId,
                order_id: data.orderId,
                amount: data.amount,
                currency: "INR",
                name: "AI Director Hub Studio",
                description: `${data.credits.toLocaleString()} Generation Credits`,
                prefill: { email: data.email, name: data.name },
                theme: { color: "#b9f42e" },
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    try {
                        const verifyRes = await fetch("/api/credits/verify", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                packageId,
                            }),
                        })
                        const verifyData = await verifyRes.json()
                        if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed")
                        setCreditMsg(verifyData.message)
                        await reloadData()
                    } catch (vErr) {
                        setCreditMsg(vErr instanceof Error ? vErr.message : "Verification failed")
                    } finally {
                        setLoadingCreditPkg(null)
                    }
                },
                modal: {
                    ondismiss: () => setLoadingCreditPkg(null),
                },
            })
            rzp.open()
        } catch (err) {
            setCreditMsg(err instanceof Error ? err.message : "Top-up failed")
            setLoadingCreditPkg(null)
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
                        <p className="text-white/50 mt-3 max-w-2xl">One monthly membership for premium course access, credits, and a larger creator portfolio.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { icon: Play, title: "Paid course access", text: "Unlock premium lessons while your plan is active." },
                            { icon: Sparkles, title: "10 portfolio videos", text: "Members can showcase up to 10 works." },
                            { icon: Zap, title: "AI Generation Credits", text: "Buy credits to render Seedance 2.5 & Flux AI videos/images." },
                        ].map((item) => (
                            <div key={item.title} className="glass-card p-5 rounded-2xl border-white/10">
                                <item.icon className="w-5 h-5 text-primary mb-4" />
                                <h2 className="font-bold">{item.title}</h2>
                                <p className="text-sm text-white/40 mt-2">{item.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* AI Credits Purchase Section */}
                    <div className="glass-card rounded-2xl border-white/10 p-6 space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-primary font-bold">
                                    <Zap className="w-5 h-5 fill-primary" />
                                    <span>AI Generation Credits</span>
                                </div>
                                <p className="text-sm text-white/40 mt-1">Power your AI Video & Image generations in AI Director Hub Studio.</p>
                            </div>
                            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-right">
                                <p className="text-[11px] uppercase tracking-wider text-white/50">Current Balance</p>
                                <p className="text-xl font-black text-primary">{creditBalance.toLocaleString()} Credits</p>
                            </div>
                        </div>

                        {creditMsg && (
                            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-bold text-primary">
                                {creditMsg}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                { id: "1000", credits: "1,000 Credits", price: "₹800", popular: false, desc: "~100 Videos or ~330 Images" },
                                { id: "2500", credits: "2,500 Credits", price: "₹2,000", popular: true, desc: "~250 Videos or ~830 Images" },
                                { id: "5000", credits: "5,000 Credits", price: "₹4,000", popular: false, desc: "~500 Videos or ~1,660 Images" },
                                { id: "10000", credits: "10,000 Credits", price: "₹8,000", popular: false, desc: "~1,000 Videos or ~3,330 Images" },
                            ].map((pkg) => (
                                <div
                                    key={pkg.id}
                                    className={`flex items-center justify-between p-4 rounded-xl border transition ${
                                        pkg.popular ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            <span>{pkg.credits}</span>
                                            {pkg.popular && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary text-black">Popular</span>}
                                        </div>
                                        <p className="text-xs text-white/40 mt-0.5">{pkg.desc}</p>
                                    </div>
                                    <button
                                        disabled={loadingCreditPkg !== null}
                                        onClick={() => handleCreditTopUp(pkg.id)}
                                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-black hover:bg-primary/90 transition disabled:opacity-50"
                                    >
                                        {loadingCreditPkg === pkg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pkg.price}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-card rounded-2xl border-white/10 p-6">
                        <h2 className="font-bold mb-1">What's included in your membership</h2>
                        <p className="text-sm text-white/40 mb-5">Everything you need to go from idea to a finished film with AI.</p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                            {[
                                "Full AI Filmmaking Crash Course (idea → finished film)",
                                "Script Writer AI Agent — turn ideas into shoot-ready scripts",
                                "Seedance Prompt AI Agent — master prompts for cinematic shots",
                                "Access to all premium courses & downloadable resources",
                                "Showcase up to 10 portfolio videos",
                                "Downloadable prompt docs & resources",
                                "Priority access to new tools & lessons",
                            ].map((feature) => (
                                <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Combined Transaction History (Paid, Cancelled, Failed) */}
                    <div className="glass-card rounded-2xl border-white/10 overflow-hidden">
                        <div className="p-5 border-b border-white/5 flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-primary" />
                            <h2 className="font-bold">Transaction & Payment History</h2>
                        </div>
                        {payments.length === 0 ? (
                            <p className="p-6 text-sm text-white/35">No transaction records yet. Your membership, credit purchases, and usage history will appear here.</p>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {payments.map((payment) => {
                                    const isPaid = payment.status === "success" || payment.status === "paid"
                                    const isCancelled = payment.status === "cancelled" || payment.status === "halted"
                                    const isUsed = payment.status === "used"

                                    return (
                                        <div key={payment.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                {isPaid ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                                ) : isCancelled ? (
                                                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                                                ) : isUsed ? (
                                                    <Zap className="w-4 h-4 text-[#b9f42e] mt-0.5 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                                )}
                                                <div>
                                                    <p className="text-sm font-bold">{payment.productInfo}</p>
                                                    <p className="text-xs text-white/35 mt-0.5">
                                                        {new Date(payment.createdAt).toLocaleDateString()} • Ref {payment.txnid}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 md:text-right">
                                                <span className={
                                                    isPaid
                                                        ? "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-emerald-400/10 text-emerald-300"
                                                        : isCancelled
                                                            ? "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-400/10 text-amber-300"
                                                            : isUsed
                                                                ? "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-white/10 text-zinc-300"
                                                                : "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-red-400/10 text-red-300"
                                                }>
                                                    {isPaid ? "Paid" : isCancelled ? "Cancelled" : isUsed ? "Generation" : "Failed"}
                                                </span>
                                                <p className="font-bold">{payment.amount}</p>
                                            </div>
                                        </div>
                                    )
                                })}
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
