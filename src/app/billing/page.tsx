"use client"

import AllAccessSubscriptionCard from "@/components/AllAccessSubscriptionCard"
import Footer from "@/components/Footer"
import EnterpriseOrderForm from "@/components/enterprise/EnterpriseOrderForm"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import {
  AlertCircle,
  BadgeCheck,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  Clapperboard,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  Loader2,
  Receipt,
  Sparkles,
  Video,
  Wand2,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const faqs = [
  ["What does All Access include?", "Every published course, including new releases while subscribed, plus Creator Studio with your own supported provider API keys."],
  ["How is Creator Studio usage billed?", "Your model provider bills your API account directly for chat and generation. All Access includes no Studio credits and never uses platform credits."],
  ["Can I cancel my subscription anytime?", "Yes. Cancel renewal from your billing dashboard. Paid access continues until the end of your current billing period."],
  ["Which API keys can I connect?", "OpenAI, Gemini, fal.ai, and BytePlus. A funded provider account is required. Features without support for your own keys cannot run on this plan."],
]

const billingHighlights = [
  { icon: Bot, label: "AI Director Agent" },
  { icon: ImageIcon, label: "AI Image Creation" },
  { icon: Video, label: "AI Video Production" },
  { icon: Clapperboard, label: "Storyboard Workflow" },
  { icon: Layers3, label: "Asset Library" },
  { icon: Wand2, label: "Workflow Skills" },
  { icon: KeyRound, label: "Your own API keys" },
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
  const { user } = useAuth()
  const [openFaq, setOpenFaq] = useState(0)
  const [subSuccess, setSubSuccess] = useState<string | null>(null)
  const [subError, setSubError] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen bg-[#080908] text-white">
      <Navbar />
      <div className="px-4 pt-24"><AllAccessSubscriptionCard /></div>

      <section className="px-4 pt-28 md:px-6">
        <div className="mx-auto max-w-[1540px] overflow-hidden rounded-[28px] border border-pink-500/25 bg-[radial-gradient(circle_at_82%_40%,rgba(255,0,102,.34),transparent_28%),linear-gradient(135deg,#33101f,#171010_58%,#260817)] p-8 md:p-12">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#ff0a63] px-3 py-1.5 text-xs font-semibold italic text-white">
            <Sparkles className="h-4 w-4 fill-white" />
            Launch pricing
          </div>
          <h1 className="mt-8 max-w-5xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Hire your AI Director Agent for images, video, storyboard, and full workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-lg font-medium text-white/55">
            Add a dedicated AI Creative Agent to your studio. Let the AI Director manage script writing, asset continuity, storyboard creation, image generation, and video production.
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

      {(subSuccess || subError) && (
        <div role="status" className="mx-auto max-w-[1200px] px-4 pt-8 md:px-6">
          {subSuccess && <p className="rounded-2xl border border-primary/40 bg-primary/10 p-5 text-sm text-primary">{subSuccess}</p>}
          {subError && <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-300"><AlertCircle className="mr-2 inline h-4 w-4" />{subError}</p>}
        </div>
      )}

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
