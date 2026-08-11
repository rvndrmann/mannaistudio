"use client"

import Footer from "@/components/Footer"
import EnterpriseOrderForm from "@/components/enterprise/EnterpriseOrderForm"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { orderedBillingTiers, type BillingTierId } from "@/lib/billing-plans"
import { AlertCircle, BadgeCheck, Bot, Check, ChevronDown, Clapperboard, Image as ImageIcon, Layers3, Loader2, Lock, Sparkles, Video, Wand2, Zap } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const faqs = [
  ["How do credits work?", "Credits are used when generating AI images and videos. Planning, script writing, workflow instructions, and chat guidance are included in your plan."],
  ["How do Razorpay subscriptions work?", "When you subscribe, Razorpay securely establishes a monthly recurring payment mandate. Your plan automatically renews each month, granting fresh credits to your account upon every successful charge."],
  ["Can I generate images without approval?", "Yes. Image generation can run directly when the user asks for it. Video generation remains approval-first unless full-auto mode is enabled."],
  ["Do these plans include MCP and CLI?", "Plus and Studio include MCP & CLI access so users can talk to the AI Director from Claude, ChatGPT-style clients, or terminal."],
]

const billingHighlights = [
  { icon: Bot, label: "AI Director Agent" },
  { icon: ImageIcon, label: "AI Image Creation" },
  { icon: Video, label: "AI Video Production" },
  { icon: Clapperboard, label: "Storyboard Workflow" },
  { icon: Layers3, label: "Asset Library" },
  { icon: Wand2, label: "Workflow Skills" },
  { icon: Zap, label: "Generation Credits" },
  { icon: BadgeCheck, label: "MCP & CLI" },
]

export default function BillingPage() {
  const { user, signInWithGoogle } = useAuth()
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [subSuccess, setSubSuccess] = useState<string | null>(null)
  const [subError, setSubError] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen bg-[#080908] text-white">
      <Navbar />

      <section className="px-4 pt-28 md:px-6">
        <div className="mx-auto max-w-[1540px] overflow-hidden rounded-[28px] border border-pink-500/25 bg-[radial-gradient(circle_at_82%_40%,rgba(255,0,102,.34),transparent_28%),linear-gradient(135deg,#33101f,#171010_58%,#260817)] p-8 md:p-12">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#ff0a63] px-3 py-1.5 text-xs font-black uppercase italic text-white">
            <Sparkles className="h-4 w-4 fill-white" />
            Launch pricing
          </div>
          <h1 className="mt-8 max-w-5xl text-4xl font-black uppercase leading-tight tracking-tight md:text-6xl">
            AI Director Hub plans for images, video, storyboard, and full workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-lg font-medium text-white/55">
            Start with chat. Generate images. Approve videos. Let the AI Director manage script, assets, storyboard, references, and production.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/studio" className="rounded-2xl bg-white px-7 py-4 font-black text-black transition hover:bg-white/90">
              Open Studio
            </Link>
            <Link href="/studio/external" className="rounded-2xl border border-white/15 bg-white/10 px-7 py-4 font-black text-white transition hover:border-primary hover:text-primary">
              MCP & CLI Access
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-20 md:px-6">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-black tracking-tight md:text-6xl">Upgrade your plan</h2>
            <p className="mt-3 text-white/45">Choose the monthly plan that matches your AI production volume.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/[.05] px-5 py-3 text-sm font-bold text-white/70">
              INR Pricing <span className="ml-2 rounded bg-primary px-2 py-0.5 text-xs text-black">RAZORPAY</span>
            </button>
            <button
              onClick={() => setAnnual((value) => !value)}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.05] px-5 py-3 text-sm font-bold"
            >
              Monthly
              <span className={`relative h-6 w-11 rounded-full transition ${annual ? "bg-primary" : "bg-white/15"}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${annual ? "left-6" : "left-1"}`} />
              </span>
              Annual
            </button>
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
                      <h3 className="text-3xl font-black uppercase">{tier.name}</h3>
                      {badgeText && (
                        <span className={`rounded px-2 py-1 text-xs font-black uppercase text-white ${isPlus ? "bg-primary text-black" : "bg-[#ff0a63]"}`}>
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
                      <p className="text-xl font-black">{tier.credits.toLocaleString()} credits/mo.</p>
                    </div>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/15">
                    <div className={`h-full rounded-full ${tier.id === "pro" ? "w-1/3 bg-white/60" : tier.id === "plus" ? "w-2/3 bg-primary" : "w-full bg-[#ff0a63]"}`} />
                  </div>
                </div>

                <div className="mt-7">
                  <span className="text-5xl font-black">₹{tier.priceInr.toLocaleString()}</span>
                  <span className="ml-2 text-white/45">/ month</span>
                  {annual && <p className="mt-2 text-sm font-bold text-primary">Annual billing selected</p>}
                </div>

                <button
                  disabled={loadingTier !== null}
                  onClick={() => handleSubscribe(tier.id)}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black shadow-lg transition disabled:opacity-50 ${buttonStyle}`}
                >
                  {loadingTier === tier.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    `Subscribe to ${tier.name}`
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-white/35">🔒 Secure payment via Razorpay Subscriptions</p>

                <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase">
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

        <p className="mx-auto mt-8 max-w-4xl text-center text-sm leading-6 text-white/35">
          Prices are shown in INR (₹). Subscription mandates automatically process recurring payments at each billing cycle through Razorpay.
        </p>
      </section>

      <section id="enterprise" className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <div className="grid gap-8 rounded-[28px] border border-primary/25 bg-[linear-gradient(160deg,rgba(185,255,24,.10),#101211_60%)] p-6 md:grid-cols-[1fr_1.1fr] md:p-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-primary">
              Enterprise
            </span>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Don&apos;t make it yourself</h2>
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

      <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <h2 className="text-4xl font-black tracking-tight md:text-5xl">Compare features</h2>
        <p className="mt-3 text-white/45">See which plan suits your AI video and image workflow.</p>

        <div className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-[#101211]">
          <div className="grid grid-cols-4 gap-4 border-b border-white/10 p-6 text-left">
            <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 font-black text-primary">
              Razorpay Checkout
            </div>
            {orderedBillingTiers.map((tier) => (
              <div key={tier.id}>
                <h3 className="text-2xl font-black">{tier.name}</h3>
                <p className="mt-3 text-white/70">₹{tier.priceInr.toLocaleString()}/mo.</p>
                <button
                  disabled={loadingTier !== null}
                  onClick={() => handleSubscribe(tier.id)}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-black transition disabled:opacity-50 ${tier.id === "studio" ? "bg-primary text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
                >
                  {loadingTier === tier.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Get ${tier.name}`}
                </button>
              </div>
            ))}
          </div>

          {[
            ["Monthly credits", "1,000", "3,500", "12,000"],
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

      <section className="mx-auto max-w-4xl px-4 py-20 md:px-6">
        <h2 className="text-center text-4xl font-black tracking-tight md:text-5xl">Frequently Asked Questions</h2>
        <div className="mt-10 space-y-3">
          {faqs.map(([question, answer], index) => (
            <button
              key={question}
              onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
              className="w-full rounded-2xl border border-white/10 bg-[#101211] p-5 text-left"
            >
              <span className="flex items-center justify-between gap-4 text-lg font-black">
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
