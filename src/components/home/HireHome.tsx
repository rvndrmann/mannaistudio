"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  FileText,
  Layers,
  LineChart,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  Video,
} from "lucide-react"
import Footer from "@/components/Footer"
import ShowcaseReel from "@/components/home/ShowcaseReel"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { formatUsdWithInr } from "@/lib/currency"
import { cheapestPackage, publishedOffers, type OfferPackage, type OfferService } from "@/lib/managed-offers"
import type { OriginalsSeriesSummary } from "@/lib/originals"
import { sortShowcase, toShowcaseVideo, type ShowcaseVideo } from "@/lib/showcase"
import { materialize, springUI } from "@/lib/motion"

/**
 * The homepage of a production company that happens to run on its own software.
 *
 * Outcome first, service second, technology third. A DTC owner arriving from a
 * Meta ad has to understand in one screen that we make their ads and that they
 * can buy that today — so nothing above the fold mentions a model, a prompt, an
 * agent or an API key, and the Creative Studio is never named at all. It is the
 * factory, not the product: the client orders what comes out of it, and the
 * team operates it.
 *
 * It carries its own header rather than the shared Navbar, which leads with a
 * Creator Studio button — the one door this visitor should never be pushed
 * through.
 */

/** The service the volume plans are sold under, seeded in the catalogue. */
const PLAN_SERVICE_KEY = "performance_ads"

const FORMATS = [
  { icon: Video, title: "UGC Ads", body: "Natural creator-style performance ads.", category: "ugc" },
  { icon: Sparkles, title: "Product Ads", body: "Showcase the product, the benefit and the offer.", category: "product" },
  { icon: LineChart, title: "Direct Response Ads", body: "Hook → problem → solution → call to action.", category: "direct_response" },
  { icon: Clapperboard, title: "Cinematic Ads", body: "Premium brand storytelling, produced end to end.", category: "cinematic" },
  { icon: Layers, title: "Creative Variations", body: "Multiple hooks and concepts, built to be tested against each other.", category: "" },
  { icon: MessageSquare, title: "Social Content", body: "Organic-style content that doubles as paid creative.", category: "" },
]

const STEPS = [
  {
    icon: FileText,
    title: "Tell us about your brand",
    body: "Your website, the product, who it is for, what the campaign has to do — and any references you already like.",
  },
  {
    icon: Search,
    title: "We research",
    body: "Brand, customer, competitors, the angles already working in your category and the ones nobody is running.",
  },
  {
    icon: Sparkles,
    title: "Concepts and scripts",
    body: "Hooks and scripts written for the campaign, so you see the idea before anything is produced.",
  },
  {
    icon: Video,
    title: "We produce",
    body: "Storyboard, visuals, voice, edit and assembly — handled by our team on our own production system.",
  },
  {
    icon: Download,
    title: "Review and download",
    body: "Ads arrive in your dashboard. Comment, ask for changes, approve, download. Nothing to install.",
  },
]

const DASHBOARD_POINTS = [
  "Start a project and submit your brand and product",
  "Watch every cut as it is delivered",
  "Leave notes pinned to the second they apply to",
  "Chat with the team doing the work",
  "Request revisions without an email chain",
  "Approve and download the finished files",
]

const PIPELINE = ["Brief", "Research", "Concepts", "Production", "Review", "Delivery"]

export default function HireHome() {
  const { user } = useAuth()
  const [videos, setVideos] = useState<ShowcaseVideo[]>([])
  const [services, setServices] = useState<OfferService[] | null>(null)
  const [originals, setOriginals] = useState<OriginalsSeriesSummary[]>([])
  const [hasProjects, setHasProjects] = useState(false)

  // The admin's chosen reel, from the showcase system that has always fed this
  // page. Nine is the most a visitor scrolls through before deciding.
  useEffect(() => {
    let active = true
    createClient()
      .from("showcase_items")
      .select("*")
      .then(({ data }) => {
        if (!active || !data) return
        setVideos(sortShowcase(data.map(toShowcaseVideo)).filter((video) => video.videoUrl).slice(0, 9))
      })
    return () => { active = false }
  }, [])

  // Prices come from the catalogue, never from this file: the admin edits them
  // in Managed Production → Offers and checkout charges from the same rows.
  // Published rows only — this is the shop window, and an admin should be
  // looking at the page their customers get, not at one with their own drafts
  // priced in it.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setServices(publishedOffers(data.services ?? [])) })
      .catch(() => { if (active) setServices([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    fetch("/api/originals", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { series: [] }))
      .then((data) => { if (active) setOriginals((data.series ?? []).slice(0, 3)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    fetch("/api/managed/projects")
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((data) => { if (active) setHasProjects(Boolean(data.projects?.length)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [user])

  const planService = services?.find((service) => service.key === PLAN_SERVICE_KEY)
  const plans = planService?.packages ?? []
  // Until the volume plans are priced and published, the rest of the catalogue
  // is what is actually on sale — so the section sells that rather than showing
  // an empty space where the prices should be.
  const fallbackServices = (services ?? []).filter((service) => service.key !== PLAN_SERVICE_KEY)
  // Always the catalogue, never a gig chosen on the visitor's behalf. Pointing
  // this at one service meant "Start a Project" sold performance ads to someone
  // who came for UGC — and when that gig was an unpublished draft, at the brief
  // for a service the checkout would refuse. Picking what to buy is the first
  // question, so /hire-us is where it gets asked.
  const startHref = "/hire-us"

  return (
    <main className="min-h-screen">
      <SiteHeader hasProjects={hasProjects} user={Boolean(user)} startHref={startHref} />

      {/* 1 — What we make, who it is for, and what to press. */}
      <section className="mx-auto max-w-6xl px-5 pb-14 pt-28 sm:px-6 sm:pt-36">
        <motion.div {...materialize} className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary sm:text-xs">
            <LineChart className="h-3.5 w-3.5" />
            AI performance ad creative
          </span>
          <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Performance Ads.
            <br />
            Made to Test. <span className="text-primary">Built to Scale.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
            AI-powered video ads for brands that need fresh creative every week. We research the
            angle, develop the concept, create the ad and deliver it ready for Meta, TikTok,
            Instagram and every other paid-social campaign you run.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={startHref}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
            >
              Start My First Ad
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#work"
              className="flex h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-6 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] hover:text-white"
            >
              See Our Ads
            </a>
          </div>
          <p className="mt-5 text-xs text-white/35">
            UGC Ads · Product Ads · Direct Response · Cinematic Ads
          </p>
        </motion.div>
      </section>

      {/* 2 — Proof, immediately. The reel is the argument. */}
      <section id="work" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ads We&rsquo;ve Created</h2>
        <p className="mt-2 text-sm text-white/45">
          From scroll-stopping product ads to cinematic brand campaigns.
        </p>
        <div className="mt-7">
          {videos.length ? (
            <ShowcaseReel videos={videos} />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-white/35">
              The reel is empty. Add work in Admin → Showcase Manager.
            </div>
          )}
        </div>
      </section>

      {/* 3 — The pain, named in the media buyer's own words. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <motion.div {...materialize}>
            <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              Your Media Buyer Needs More Creative.
              <br />
              <span className="text-primary">We Make It.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              Performance campaigns live on testing, and every winning ad fatigues eventually.
              Traditional production is too slow and too expensive to feed that, and a rotating
              cast of freelancers never produces two ads that look like the same brand.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              So you need a steady supply of new hooks, angles, concepts, UGC variations, product
              ads and direct-response creative — arriving weekly, not quarterly.
            </p>
            <p className="mt-5 rounded-xl border border-primary/25 bg-primary/[0.07] p-4 text-sm leading-relaxed text-white/80">
              AI Director Hub gives your brand a continuous creative production engine without
              building an internal production team.
            </p>
          </motion.div>

          <motion.ul {...materialize} transition={{ ...springUI, delay: 0.05 }} className="grid gap-3 sm:grid-cols-2">
            {["Hooks", "Angles", "Concepts", "UGC variations", "Product ads", "Direct response"].map((need) => (
              <li key={need} className="glass-card rounded-xl border-white/10 px-4 py-4 text-sm font-semibold text-white/75">
                {need}
              </li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* 4 — Something to buy, not a call to book. */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-6">
        {/* The heading follows whichever grid renders. With the volume plans
            published it is a choice of how many ads a month; without them it is
            a choice of what to have made, and calling that "volume" describes a
            section that is not on the page. */}
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {plans.length ? "Choose Your Creative Volume" : "Choose What We Make You"}
        </h2>
        <p className="mt-2 text-sm text-white/45">
          {plans.length
            ? "Pick the number of ads your testing needs. The price you see is the price."
            : "Pick the kind of ad you need. The price you see is the price."}
        </p>

        {services === null ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-80 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            ))}
          </div>
        ) : plans.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.key} plan={plan} serviceKey={PLAN_SERVICE_KEY} />
            ))}
          </div>
        ) : fallbackServices.length ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fallbackServices.map((service) => (
              <ServiceCard key={service.key} service={service} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-white/40">
            Nothing is on sale yet. Add a service in Admin → Managed Production → Offers.
          </div>
        )}
      </section>

      {/* 5 — The process, so nobody has to ask what happens after they pay. */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From Product URL to Finished Ads</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              {...materialize}
              transition={{ ...springUI, delay: index * 0.04 }}
              className="glass-card rounded-2xl border-white/10 p-5"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-bold text-white/30">0{index + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">{step.body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* 6 — How it is possible, now that they know what it is. No tool names:
             the client is buying what comes out of the factory. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <div className="glass-card rounded-3xl border-white/10 p-7 sm:p-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Powered by Our Proprietary AI Production System
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/55">
            Traditional agencies coordinate freelancers, production crews and a dozen tools. Behind
            every AI Director Hub campaign is one internal system that combines creative research,
            scripting, storyboarding, AI production, editing and project management — which is why
            a week of an agency&rsquo;s calendar is a day of ours.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {PIPELINE.map((stage, index) => (
              <span key={stage} className="flex items-center gap-2">
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70">
                  {stage}
                </span>
                {index < PIPELINE.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-white/20" />}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/45">
            You send the brief. Our team runs the machinery. There is nothing for you to learn,
            install or operate.
          </p>
        </div>
      </section>

      {/* 7 — The thing they get access to, which already exists. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <motion.div {...materialize}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Everything Happens Inside Your Dashboard
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              No endless email chains. No chasing freelancers. No production software to manage.
              Every project has one page, and everything about it lives there.
            </p>
            <Link
              href={hasProjects ? "/hire-us/projects" : startHref}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-md border border-white/15 px-5 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] hover:text-white"
            >
              {hasProjects ? "Open your projects" : "Start a project"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.ul {...materialize} transition={{ ...springUI, delay: 0.05 }} className="glass-card space-y-3 rounded-2xl border-white/10 p-6">
            {DASHBOARD_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-white/65">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* 8 — One partner, every format they were about to hire separately for. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          One Creative Partner. Multiple Ad Formats.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((format, index) => (
            <motion.div
              key={format.title}
              {...materialize}
              transition={{ ...springUI, delay: index * 0.04 }}
              className="glass-card rounded-2xl border-white/10 p-5"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <format.icon className="h-4 w-4" />
              </span>
              <h3 className="mt-4 text-sm font-bold">{format.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">{format.body}</p>
              {format.category && videos.some((video) => video.category === format.category) && (
                <a href="#work" className="mt-3 inline-flex text-[11px] font-semibold text-primary hover:underline">
                  See examples
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* 9 — Originals, kept and repositioned: proof of range, not the offer. */}
      {originals.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
          <div className="glass-card rounded-3xl border-white/10 p-7 sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">AI Director Hub Originals</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">
                  We also use our production engine to make original AI films and short-form series,
                  pushing the same system that produces our clients&rsquo; campaigns.
                </p>
              </div>
              <Link
                href="/originals"
                className="flex h-10 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] hover:text-white"
              >
                Watch Originals
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {originals.map((series) => (
                <Link
                  key={series.id}
                  href={`/originals/${series.slug}`}
                  className="group overflow-hidden rounded-xl border border-white/10 bg-black"
                >
                  <span className="block aspect-[2/3] w-full overflow-hidden">
                    {series.posterUrl ? (
                      <img
                        src={series.posterUrl}
                        alt={series.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-xs text-white/25">
                        {series.title}
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-3 py-2 text-[11px] font-semibold text-white/70">
                    {series.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 10 — The ask. */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        <motion.div
          {...materialize}
          className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] to-transparent p-8 text-center sm:p-14"
        >
          <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
            Your Next Winning Ad Starts With Another Test.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55">
            Send us your product. We will turn it into performance-ready creative.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={startHref}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
            >
              Start My First Ad
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#work"
              className="flex h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-7 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] hover:text-white"
            >
              See Our Work
            </a>
          </div>
        </motion.div>
      </section>

      <Footer />
    </main>
  )
}

/**
 * The public navigation: five links and one button.
 *
 * Studio and Courses are absent by design — they are internal tooling, and a
 * visitor who has come to buy ads should never be offered the machine that
 * makes them. Neither route is removed; both stay exactly where the team
 * reaches them.
 */
function SiteHeader({ hasProjects, user, startHref }: { hasProjects: boolean; user: boolean; startHref: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-black/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-base font-semibold sm:text-lg">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" />
          <span className="hidden sm:inline">AI Director <span className="text-primary">Hub</span></span>
        </Link>

        {/* Hire Our Team is the page this site is for, and it was the one thing
            the header did not name — the whole nav was hidden below lg, so on a
            phone there was no way to reach the catalogue except the CTA. It is
            first and it never hides; the in-page anchors, which only mean
            anything on this page, are what drop away as the bar narrows. */}
        <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <Link
            href="/hire-us"
            className="rounded-md px-2.5 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:px-3"
          >
            Hire Our Team
          </Link>
          {[
            { href: "#work", label: "Work" },
            { href: "#how", label: "How It Works" },
            { href: "#pricing", label: "Pricing" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-white/55 transition hover:text-white lg:block"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/originals"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-white/55 transition hover:text-white sm:block"
          >
            Originals
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {hasProjects ? (
            <Link
              href="/hire-us/projects"
              className="flex h-10 items-center rounded-md border border-white/15 px-3 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white sm:px-4"
            >
              Projects
            </Link>
          ) : (
            <Link
              href={user ? "/account" : "/login"}
              className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-white/55 transition hover:text-white sm:flex"
            >
              {user ? "Account" : "Login"}
            </Link>
          )}
          <Link
            href={startHref}
            className="flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97] sm:px-4"
          >
            Start a Project
          </Link>
        </div>
      </div>
    </header>
  )
}

/** One volume plan, priced by the catalogue. */
function PlanCard({ plan, serviceKey }: { plan: OfferPackage; serviceKey: string }) {
  return (
    <motion.div
      {...materialize}
      className={`glass-card relative flex flex-col rounded-2xl p-6 ${
        plan.popular ? "border-primary/40 bg-primary/[0.05]" : "border-white/10"
      }`}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-black">
          <Star className="h-3 w-3" />
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
      <p className="mt-1 text-sm text-primary/90">{plan.summary}</p>
      <p className="mt-4 text-2xl font-bold">{formatUsdWithInr(plan.priceInr)}</p>

      {plan.includes.length > 0 && (
        <ul className="mt-5 flex-1 space-y-2">
          {plan.includes.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-white/55">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/hire-us/brief?service=${serviceKey}&package=${plan.key}`}
        className={`mt-6 flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition duration-press ease-out active:scale-[0.97] ${
          plan.popular
            ? "bg-primary text-black hover:brightness-110"
            : "border border-white/15 text-white hover:bg-white/[0.06]"
        }`}
      >
        Start {plan.name}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  )
}

/** What is on sale when the volume plans have not been published yet. */
function ServiceCard({ service }: { service: OfferService }) {
  const cheapest = cheapestPackage(service)
  return (
    <motion.div {...materialize} className="glass-card flex flex-col rounded-2xl border-white/10 p-6">
      <h3 className="text-lg font-bold tracking-tight">{service.name}</h3>
      {service.tagline && <p className="mt-1 text-sm text-primary/90">{service.tagline}</p>}
      {cheapest && <p className="mt-4 text-2xl font-bold">{formatUsdWithInr(cheapest.priceInr)}</p>}
      {service.deliverables.length > 0 && (
        <ul className="mt-5 flex-1 space-y-2">
          {service.deliverables.slice(0, 4).map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-white/55">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/hire-us/brief?service=${service.key}`}
        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
      >
        {service.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  )
}
