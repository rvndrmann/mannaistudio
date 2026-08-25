"use client"

import Footer from "@/components/Footer"
import EnterpriseOrderForm from "@/components/enterprise/EnterpriseOrderForm"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { orderedBillingTiers, type BillingTierId } from "@/lib/billing-plans"
import { INR_PER_USD, formatInr, formatUsd, formatUsdWithInr } from "@/lib/currency"
import {
  AlertCircle,
  BadgeCheck,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  Clapperboard,
  CreditCard,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  Loader2,
  Lock,
  Receipt,
  Sparkles,
  Video,
  Wand2,
  XCircle,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const faqs = [
  ["How do credits work?", "Credits are used when generating AI images and videos. Planning, script writing, workflow instructions, and chat guidance are included in your plan."],
  ["How do Razorpay subscriptions work?", "When you subscribe, Razorpay securely establishes a monthly recurring payment mandate. Your plan automatically renews each month, granting fresh credits to your account upon every successful charge."],
  ["Can I cancel my subscription anytime?", "Yes. You can cancel your subscription anytime directly from your billing dashboard. Your membership access and remaining credits stay active until the end of your current billing period."],
  ["Can I buy extra credits anytime?", `Active subscribers can purchase additional credits starting from 1,000 credits (${formatUsdWithInr(1000)}) up to any custom amount whenever their production needs grow. Free accounts cannot buy credits.`],
  ["Can I use my own API keys?", "Yes, with an active paid subscription. Bring your own OpenAI, Google, BytePlus, or fal.ai API keys and pay the provider directly at its rates, or use studio credits when you prefer. Free accounts cannot use BYO API keys."],
  ["Why is my card charged in rupees?", `Prices are shown in US dollars for convenience, but AI Director Hub bills through Razorpay, an Indian payment gateway, so the charge settles in rupees and that is the amount your statement will show. International cards are accepted. Your bank applies its own exchange rate, so the dollar total may differ by a few cents from the figure shown here (currently converted at ₹${INR_PER_USD} to the dollar).`],
]

const billingHighlights = [
  { icon: KeyRound, label: "BYO API on every plan" },
  { icon: Bot, label: "AI Director Agent" },
  { icon: ImageIcon, label: "AI Image Creation" },
  { icon: Video, label: "AI Video Production" },
  { icon: Clapperboard, label: "Storyboard Workflow" },
  { icon: Layers3, label: "Asset Library" },
  { icon: Wand2, label: "Workflow Skills" },
  { icon: Zap, label: "Generation Credits" },
  { icon: BadgeCheck, label: "MCP & CLI" },
]

type TransactionRecord = {
  id: string
  txnid: string
  paymentId: string
  amount: string
  productInfo: string
  status: string
  createdAt: string
}

type UserSubscriptionInfo = {
  active: boolean
  status: string
  subscriptionId: string | null
  createdAt: string | null
  nextBillingDate: string | null
}

export default function BillingPage() {
  const { user, signInWithGoogle } = useAuth()
  const [openFaq, setOpenFaq] = useState(0)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [subSuccess, setSubSuccess] = useState<string | null>(null)
  const [subError, setSubError] = useState<string | null>(null)

  // Custom Credit Top-Up state
  const [customCreditAmount, setCustomCreditAmount] = useState<number>(1000)
  const [topUpLoading, setTopUpLoading] = useState(false)

  // Subscription & Transaction history state
  const [subscription, setSubscription] = useState<UserSubscriptionInfo | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [txLoading, setTxLoading] = useState(false)

  const loadBillingData = async () => {
    if (!user) return
    setTxLoading(true)
    try {
      const res = await fetch("/api/billing/transactions", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setTransactions(json.transactions || [])
        setSubscription(json.subscription || null)
      }
    } catch (err) {
      console.warn("Failed to load billing details:", err)
    } finally {
      setTxLoading(false)
    }
  }

  useEffect(() => {
    loadBillingData()
  }, [user])

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const handleSubscribe = async (tierId: BillingTierId) => {
    if (!user) {
      signInWithGoogle()
      return
    }

    setLoadingTier(tierId)
    setSubSuccess(null)
    setSubError(null)

    try {
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) throw new Error("Failed to load Razorpay payment gateway script.")

      const res = await fetch("/api/razorpay/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create Razorpay subscription.")

      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "AI Director Hub",
        description: `${data.planName} Membership Subscription`,
        prefill: {
          email: data.email || "",
          name: data.name || "Creator",
        },
        theme: { color: "#b9f42e" },
        handler: (response: { razorpay_payment_id?: string; razorpay_subscription_id?: string; razorpay_signature?: string }) => {
          setSubSuccess(`Subscribed to ${data.planName} tier! Reference: ${response.razorpay_payment_id || response.razorpay_subscription_id}`)
          setLoadingTier(null)
          loadBillingData()
        },
        modal: {
          ondismiss: () => setLoadingTier(null),
        },
      })

      rzp.open()
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Subscription checkout failed.")
      setLoadingTier(null)
    }
  }

  const handleCancelSubscription = async () => {
    if (!user || !subscription?.subscriptionId) return
    if (!confirm("Are you sure you want to cancel your monthly subscription? Your access will remain active until the end of your current billing cycle.")) {
      return
    }

    setCancelLoading(true)
    setSubSuccess(null)
    setSubError(null)

    try {
      const res = await fetch("/api/razorpay/subscription/cancel", {
        method: "POST",
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to cancel subscription.")

      setSubSuccess("Subscription cancelled successfully. You will maintain access until your current billing period ends.")
      loadBillingData()
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Subscription cancellation failed.")
    } finally {
      setCancelLoading(false)
    }
  }

  const handleBuyCustomCredits = async (amountInr: number) => {
    if (!user) {
      signInWithGoogle()
      return
    }

    if (!subscription?.active) {
      setSubError("An active subscription is required to buy generation credits.")
      return
    }

    if (amountInr < 1000) {
      setSubError(`Minimum purchase is 1,000 credits (${formatUsdWithInr(1000)}).`)
      return
    }

    setTopUpLoading(true)
    setSubSuccess(null)
    setSubError(null)

    try {
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) throw new Error("Failed to load Razorpay payment gateway script.")

      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountInr }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create credit order")

      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: "INR",
        name: "AI Director Hub",
        description: `${data.credits.toLocaleString()} Generation Credits (₹${data.priceInr.toLocaleString()})`,
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
              }),
            })
            const verifyData = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed")
            setSubSuccess(verifyData.message)
            loadBillingData()
          } catch (vErr) {
            setSubError(vErr instanceof Error ? vErr.message : "Payment verification failed")
          } finally {
            setTopUpLoading(false)
          }
        },
        modal: {
          ondismiss: () => setTopUpLoading(false),
        },
      })
      rzp.open()
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Credit purchase failed.")
      setTopUpLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#080908] text-white">
      <Navbar />

      <section className="px-4 pt-28 md:px-6">
        <div className="mx-auto max-w-[1540px] overflow-hidden rounded-[28px] border border-pink-500/25 bg-[radial-gradient(circle_at_82%_40%,rgba(255,0,102,.34),transparent_28%),linear-gradient(135deg,#33101f,#171010_58%,#260817)] p-8 md:p-12">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#ff0a63] px-3 py-1.5 text-xs font-semibold italic text-white">
            <Sparkles className="h-4 w-4 fill-white" />
            Launch pricing
          </div>
          <h1 className="mt-8 max-w-5xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Hire your AI Director Employee for images, video, storyboard, and full workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-lg font-medium text-white/55">
            Add a dedicated AI Creative Employee to your studio. Let the AI Director manage script writing, asset continuity, storyboard creation, image generation, and video production.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/studio" className="rounded-2xl bg-white px-7 py-4 font-semibold text-black transition hover:bg-white/90">
              Open Studio
            </Link>
          </div>
        </div>
      </section>

      {/* ACTIVE SUBSCRIPTION DETAILS & CANCEL SUBSCRIPTION CARD */}
      {user && subscription && subscription.active && (
        <section className="mx-auto max-w-[1200px] px-4 pt-12 md:px-6">
          <div className="rounded-[28px] border border-primary/40 bg-[linear-gradient(135deg,#132213,#0b0d0c_70%)] p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-black">
                    Active Subscription
                  </span>
                  <span className="text-xs font-mono text-white/50">
                    ID: {subscription.subscriptionId || "Active Plan"}
                  </span>
                </div>

                <h2 className="mt-4 text-2xl font-semibold md:text-3xl">Your Monthly AI Director Membership</h2>

                <div className="mt-4 flex flex-wrap gap-6 text-xs font-bold text-white/70">
                  {subscription.createdAt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>Started: {new Date(subscription.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  )}
                  {subscription.nextBillingDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>Next Billing Date: {new Date(subscription.nextBillingDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  )}
                </div>
              </div>

              {subscription.subscriptionId && (
                <div>
                  <button
                    disabled={cancelLoading}
                    onClick={handleCancelSubscription}
                    className="flex items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-3.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {cancelLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-300" />
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Cancel Subscription
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MONTHLY SUBSCRIPTION PLANS */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-6">
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Upgrade your plan</h2>
            <p className="mt-3 text-white/45">Choose the monthly plan that matches your AI production volume.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-white/10 bg-white/[.05] px-5 py-3 text-sm font-bold text-white/70">
              INR Monthly Pricing <span className="ml-2 rounded bg-primary px-2 py-0.5 text-xs text-black">RAZORPAY</span>
            </span>
          </div>
        </div>

        {subSuccess && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-5 text-sm font-bold text-primary">
            <Check className="h-5 w-5 shrink-0" />
            <span>{subSuccess}</span>
          </div>
        )}

        {subError && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-sm font-bold text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{subError}</span>
          </div>
        )}

        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[.06] p-5 sm:flex-row sm:items-center">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-black">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-white">Bring your own API keys — included with every paid subscription.</p>
            <p className="mt-1 text-sm text-white/55">Use OpenAI, Google, BytePlus, or fal.ai and pay provider rates directly. Free accounts cannot use BYO API keys.</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {orderedBillingTiers.map((tier) => {
            const isStudio = tier.id === "studio"
            const isPlus = tier.id === "plus"
            const cardAccent = isStudio
              ? "border-pink-500/35 bg-[linear-gradient(160deg,rgba(255,0,102,.24),#191b1b_62%)]"
              : isPlus
                ? "border-primary/35 bg-[linear-gradient(160deg,rgba(185,255,24,.16),#191b1b_58%)]"
                : "border-white/12 bg-[#191b1b]"

            const buttonStyle = isStudio
              ? "bg-[#ff0a63] text-white hover:bg-[#ff2a77]"
              : isPlus
                ? "bg-primary text-black hover:bg-primary/90"
                : "bg-white text-black hover:bg-white/90"

            const badgeText = isPlus ? "Most Popular" : isStudio ? "Best Value" : null

            return (
              <article key={tier.id} className={`rounded-[28px] border p-5 ${cardAccent}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-3xl font-semibold">{tier.name}</h3>
                      {badgeText && (
                        <span className={`rounded px-2 py-1 text-xs font-semibold  text-white ${isPlus ? "bg-primary text-black" : "bg-[#ff0a63]"}`}>
                          {badgeText}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-white/45">{tier.subtitle}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-white/[.06] p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-1 h-5 w-5 shrink-0 text-white" />
                    <div>
                      <p className="text-xl font-semibold">{tier.credits.toLocaleString()} credits/mo.</p>
                    </div>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/15">
                    <div className={`h-full rounded-full ${tier.id === "pro" ? "w-1/3 bg-white/60" : tier.id === "plus" ? "w-2/3 bg-primary" : "w-full bg-[#ff0a63]"}`} />
                  </div>
                </div>

                <div className="mt-7">
                  <span className="text-5xl font-semibold">{formatUsd(tier.priceInr)}</span>
                  <span className="ml-2 text-white/45">/ month</span>
                  {/* Razorpay charges in rupees, and that is the amount that
                      reaches the card statement — so it is named here rather
                      than discovered at checkout. */}
                  <p className="mt-2 text-xs text-white/40">
                    Billed as {formatInr(tier.priceInr)} / month by Razorpay
                  </p>
                </div>

                <button
                  disabled={loadingTier !== null}
                  onClick={() => handleSubscribe(tier.id)}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold shadow-lg transition disabled:opacity-50 ${buttonStyle}`}
                >
                  {loadingTier === tier.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    `Subscribe to ${tier.name}`
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-white/35">🔒 Secure monthly payment via Razorpay Subscriptions</p>

                <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Lock className="h-4 w-4" />
                    Included features
                  </div>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-white/75">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* BUY EXTRA CREDITS TOP-UP SECTION (₹1 PER CREDIT, MIN ₹1,000) */}
      <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <div className="overflow-hidden rounded-[28px] border border-primary/30 bg-[radial-gradient(circle_at_20%_20%,rgba(185,254,46,0.12),transparent_40%),linear-gradient(135deg,#121a14,#0c0e0d)] p-6 md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 t-caption text-primary">
                <Zap className="h-4 w-4 fill-primary" />
                Pay-As-You-Go Credits
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Buy Extra Generation Credits
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
                Need more credits? Active subscribers can buy top-up credits anytime — <strong className="text-primary font-bold">1,000 credits for {formatUsd(1000)}</strong>.
                Minimum purchase is 1,000 credits — add as much as you need.
              </p>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-2.5">
              {[1000, 2500, 5000, 10000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCustomCreditAmount(preset)}
                  disabled={!subscription?.active}
                  className={`rounded-2xl border px-4 py-2.5 text-xs font-bold transition ${
                    customCreditAmount === preset
                      ? "border-primary bg-primary text-black"
                      : "border-white/10 bg-white/[.04] text-white hover:border-white/20"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {formatUsd(preset)} ({preset.toLocaleString()} Cr)
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-black/40 p-6 md:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-2">
              <label htmlFor="custom-credits" className="t-caption text-white/70">
                Enter Amount — 1 credit per ₹1, minimum 1,000 (Razorpay bills in ₹)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-lg font-semibold text-primary">₹</span>
                <input
                  id="custom-credits"
                  type="number"
                  disabled={!subscription?.active}
                  min={1000}
                  step={100}
                  value={customCreditAmount}
                  onChange={(e) => setCustomCreditAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full rounded-xl border border-white/15 bg-white/[.06] py-3.5 pl-9 pr-4 text-xl font-semibold text-white outline-none focus:border-primary"
                  placeholder="1000"
                />
              </div>
              <span className="text-xs text-white/45">
                Calculated Credits: <strong className="text-primary font-bold">{customCreditAmount.toLocaleString()} Credits</strong>
                {customCreditAmount > 0 && <> — {formatUsdWithInr(customCreditAmount)}</>}
              </span>
            </div>

            <div className="flex items-end">
              <button
                disabled={topUpLoading || customCreditAmount < 1000 || !subscription?.active}
                onClick={() => handleBuyCustomCredits(customCreditAmount)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-black transition hover:bg-primary/90 disabled:opacity-40 md:w-auto"
              >
                {topUpLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    Buy {customCreditAmount.toLocaleString()} Credits ({formatUsd(customCreditAmount)})
                  </>
                )}
              </button>
            </div>
          </div>
          {!subscription?.active && (
            <p className="mt-4 text-sm text-amber-300">Subscribe to a plan before buying generation credits.</p>
          )}
        </div>
      </section>

      {/* USER TRANSACTION HISTORY SECTION */}
      {user && (
        <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <History className="h-4 w-4" />
                Billing History
              </div>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Transaction History</h2>
            </div>
            {txLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#101211]">
            {transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[.02] text-xs font-semibold text-white/40">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Transaction / Item</th>
                      <th className="p-4">Reference ID</th>
                      <th className="p-4 text-right">Amount / Credits</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((tx) => {
                      const st = (tx.status || "").toLowerCase()
                      const isCancelled = st.includes("cancel")
                      const isFailed = st.includes("fail")
                      const isSuccess = st.includes("success") || st.includes("paid")

                      const badgeStyle = isCancelled
                        ? "bg-amber-400/15 border-amber-400/30 text-amber-400"
                        : isFailed
                          ? "bg-red-400/15 border-red-400/30 text-red-400"
                          : isSuccess
                            ? "bg-emerald-400/15 border-emerald-400/30 text-emerald-400"
                            : "bg-white/10 border-white/20 text-white/70"

                      return (
                        <tr key={tx.id} className="transition hover:bg-white/[.02]">
                          <td className="p-4 text-xs font-bold text-white/60">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </td>
                          <td className="p-4 font-bold text-white">
                            {tx.productInfo}
                          </td>
                          <td className="p-4 font-mono text-xs text-white/40">
                            {tx.paymentId || tx.txnid || "—"}
                          </td>
                          <td className="p-4 text-right font-semibold text-primary">
                            {tx.amount}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`rounded-full border px-2.5 py-0.5 t-caption ${badgeStyle}`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-white/40">
                <Receipt className="h-10 w-10 text-white/20 mb-3" />
                <p className="font-bold text-sm">No transaction records found yet.</p>
                <p className="mt-1 text-xs text-white/30">Your subscription payments, credit top-ups, and cancellations will appear here.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ENTERPRISE FORM */}
      <section id="enterprise" className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <div className="grid gap-8 rounded-[28px] border border-primary/25 bg-[linear-gradient(160deg,rgba(185,255,24,.10),#101211_60%)] p-6 md:grid-cols-[1fr_1.1fr] md:p-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 t-caption text-primary">
              Enterprise
            </span>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">Don&apos;t make it yourself</h2>
            <p className="mt-3 max-w-md text-white/50">
              Hire the AI Director Hub team to produce the whole video for you — script, characters,
              storyboard, generation, and final edit. Billed per finished minute, so you pay for the
              delivered film rather than the credits it took to get there.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-white/60">
              <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> A named director and production team on your brief</li>
              <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Start from an existing Studio project or a blank page</li>
              <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Revisions handled by the team, not your credit balance</li>
              <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Quote confirmed before any work or payment</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/40 p-6">
            <EnterpriseOrderForm compact />
          </div>
        </div>
      </section>

      {/* FEATURE COMPARISON */}
      <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">Compare features</h2>
        <p className="mt-3 text-white/45">See which plan suits your AI video and image workflow.</p>

        <div className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-[#101211]">
          <div className="grid grid-cols-4 gap-4 border-b border-white/10 p-6 text-left">
            <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 font-semibold text-primary">
              Razorpay Checkout
            </div>
            {orderedBillingTiers.map((tier) => (
              <div key={tier.id}>
                <h3 className="text-2xl font-semibold">{tier.name}</h3>
                <p className="mt-3 text-white/70">{formatUsd(tier.priceInr)}/mo.</p>
                <p className="text-xs text-white/40">Billed as {formatInr(tier.priceInr)}</p>
                <button
                  disabled={loadingTier !== null}
                  onClick={() => handleSubscribe(tier.id)}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition disabled:opacity-50 ${tier.id === "studio" ? "bg-primary text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
                >
                  {loadingTier === tier.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Get ${tier.name}`}
                </button>
              </div>
            ))}
          </div>

          {[
            ["Monthly credits", "1,000", "3,500", "12,000"],
            ["Bring your own API keys (paid plans only)", "Yes", "Yes", "Yes"],
            ["AI Director chat", "Yes", "Yes", "Yes"],
            ["AI Director voice", "No", "Yes", "Yes"],
            ["MCP & CLI access", "No", "Yes", "Yes"],
            ["Full-auto video workflow", "No", "Limited", "Yes"],
            ["Marketing Agent", "No", "No", "Yes"],
            ["Workflow skills", "Basic", "Advanced", "Priority"],
          ].map((row) => (
            <div key={row[0]} className="grid grid-cols-4 gap-4 border-b border-white/5 px-6 py-5 text-sm last:border-b-0">
              <div className="font-bold text-white/75">{row[0]}</div>
              {row.slice(1).map((cell, index) => (
                <div key={`${row[0]}-${index}`} className="text-white/55">{cell}</div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* FAQS */}
      <section className="mx-auto max-w-4xl px-4 py-20 md:px-6">
        <h2 className="text-center text-4xl font-semibold tracking-tight md:text-5xl">Frequently Asked Questions</h2>
        <div className="mt-10 space-y-3">
          {faqs.map(([question, answer], index) => (
            <button
              key={question}
              onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
              className="w-full rounded-2xl border border-white/10 bg-[#101211] p-5 text-left"
            >
              <span className="flex items-center justify-between gap-4 text-lg font-semibold">
                {question}
                <ChevronDown className={`h-5 w-5 transition ${openFaq === index ? "rotate-180" : ""}`} />
              </span>
              {openFaq === index && <p className="mt-4 text-sm leading-6 text-white/50">{answer}</p>}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-20 md:px-6">
        <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/[.04] p-6 md:grid-cols-4">
          {billingHighlights.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-black/25 p-4">
              <item.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-white/70">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  )
}
