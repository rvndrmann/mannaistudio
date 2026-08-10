"use client"

import Footer from "@/components/Footer"
import EnterpriseOrderForm from "@/components/enterprise/EnterpriseOrderForm"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { BadgeCheck, Bot, Check, ChevronDown, Clapperboard, Image as ImageIcon, Layers3, Lock, Sparkles, Video, Wand2, X, Zap } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const plans = [
  {
    name: "Starter",
    price: "$9",
    subtitle: "For first AI creators",
    credits: "120 credits/mo.",
    imageGenerations: "~60 AI image generations",
    videoGenerations: "~6 short video clips",
    cta: "Get Starter",
    accent: "border-white/12 bg-[#191b1b]",
    button: "bg-white text-black hover:bg-white/90",
    badge: "",
    features: [
      "AI Director chat workflow",
      "Script and storyboard planning",
      "Image generation access",
      "Upload image, video, and audio references",
      "2 parallel generation jobs",
      "Basic workflow skills",
    ],
    locked: ["Full-auto video workflow", "MCP & CLI access", "Lowest credit cost"],
  },
  {
    name: "Pro",
    price: "$29",
    subtitle: "For everyday AI creation",
    credits: "600 credits/mo.",
    imageGenerations: "~300 AI image generations",
    videoGenerations: "~27 short video clips",
    cta: "Get Pro",
    accent: "border-primary/35 bg-[linear-gradient(160deg,rgba(185,255,24,.16),#191b1b_58%)]",
    button: "bg-primary text-black hover:bg-primary/90",
    badge: "Most Popular",
    features: [
      "Everything in Starter",
      "AI Director voice workflow",
      "Storyboard image generation",
      "Character and asset continuity",
      "MCP & CLI access",
      "4 parallel generation jobs",
      "Advanced workflow skills",
    ],
    locked: ["Full-auto high volume runs"],
  },
  {
    name: "Studio",
    price: "$99",
    subtitle: "For teams and serious AI projects",
    credits: "2,400 credits/mo.",
    imageGenerations: "~1,200 AI image generations",
    videoGenerations: "~100 short video clips",
    cta: "Get Studio",
    accent: "border-pink-500/35 bg-[linear-gradient(160deg,rgba(255,0,102,.24),#191b1b_62%)]",
    button: "bg-[#ff0a63] text-white hover:bg-[#ff2a77]",
    badge: "Best Value",
    features: [
      "Everything in Pro",
      "Full-auto production mode",
      "Priority AI Director workflows",
      "Team-style episode production",
      "8 parallel generation jobs",
      "Lowest credit cost",
      "Priority support",
    ],
    locked: [],
  },
]

const faqs = [
  ["How do credits work?", "Credits are used when generating AI images and videos. Planning, script writing, workflow instructions, and chat guidance are included in your plan."],
  ["Can I generate images without approval?", "Yes. Image generation can run directly when the user asks for it. Video generation remains approval-first unless full-auto mode is enabled."],
  ["Do these plans include MCP and CLI?", "Pro and Studio include MCP and CLI access so users can talk to the AI Director from Claude, ChatGPT-style clients, or terminal."],
  ["When will Razorpay checkout work?", "The buttons are ready as pricing placeholders. Add the Razorpay subscription links later and connect each button to the matching plan."],
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
  const [annual, setAnnual] = useState(true)
  const [openFaq, setOpenFaq] = useState(0)

  const handlePlanClick = () => {
    if (!user) {
      signInWithGoogle()
      return
    }
    window.alert("Razorpay subscription link will be added here soon.")
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
              Not sure which plan? <span className="ml-2 rounded bg-primary px-2 py-0.5 text-xs text-black">NEW</span>
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

        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className={`rounded-[28px] border p-5 ${plan.accent}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-3xl font-black uppercase">{plan.name}</h3>
                    {plan.badge && <span className="rounded bg-[#ff0a63] px-2 py-1 text-xs font-black uppercase text-white">{plan.badge}</span>}
                  </div>
                  <p className="mt-2 text-sm text-white/45">{plan.subtitle}</p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl bg-white/[.06] p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-xl font-black">{plan.credits}</p>
                    <p className="mt-1 text-sm text-white/45">{plan.imageGenerations}</p>
                    <p className="mt-1 text-sm text-white/45">{plan.videoGenerations}</p>
                  </div>
                </div>
                <div className="mt-5 h-2 rounded-full bg-white/15">
                  <div className={`h-full rounded-full ${plan.name === "Starter" ? "w-1/4 bg-white/60" : plan.name === "Pro" ? "w-2/3 bg-primary" : "w-full bg-[#ff0a63]"}`} />
                </div>
              </div>

              <div className="mt-7">
                <span className="text-5xl font-black">{plan.price}</span>
                <span className="ml-2 text-white/45">per month</span>
                {annual && <p className="mt-2 text-sm font-bold text-primary">Annual billing selected</p>}
              </div>

              <button onClick={handlePlanClick} className={`mt-6 w-full rounded-2xl px-5 py-4 text-base font-black shadow-lg transition ${plan.button}`}>
                {plan.cta}
              </button>
              <p className="mt-3 text-center text-xs text-white/35">Razorpay subscription link coming soon</p>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase">
                  <Lock className="h-4 w-4" />
                  Included features
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-white/75">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {plan.locked.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-white/30">
                      <X className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-4xl text-center text-sm leading-6 text-white/35">
          Prices are shown in USD. Local taxes and payment gateway fees may apply at checkout. Final Razorpay subscription links will be connected when provided.
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
              Annual 30% off
              <span className="h-6 w-11 rounded-full bg-primary p-1"><span className="block h-4 w-4 translate-x-5 rounded-full bg-white" /></span>
            </div>
            {plans.map((plan) => (
              <div key={plan.name}>
                <h3 className="text-2xl font-black">{plan.name}</h3>
                <p className="mt-3 text-white/70">{plan.price}/month</p>
                <button onClick={handlePlanClick} className={`mt-4 w-full rounded-xl px-4 py-3 font-black ${plan.name === "Studio" ? "bg-primary text-black" : "bg-white/15 text-white"}`}>
                  Get Plan
                </button>
              </div>
            ))}
          </div>

          {[
            ["Concurrent jobs", "2", "4", "8"],
            ["AI Director chat", "Yes", "Yes", "Yes"],
            ["AI Director voice", "No", "Yes", "Yes"],
            ["MCP & CLI", "No", "Yes", "Yes"],
            ["Full-auto video workflow", "No", "Limited", "Yes"],
            ["Monthly credits", "120", "600", "2,400"],
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
