"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Check, Clapperboard, Loader2, MessageSquare, Play, Sparkles, Film, Zap, Download } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import { formatUsdWithInr } from "@/lib/currency"
import { cheapestPackage, type OfferService } from "@/lib/managed-offers"
import { materialize, springUI } from "@/lib/motion"

/**
 * Hire Our Creative Team.
 *
 * The front door to the managed service. It sells four things and sends people
 * into one brief; everything about how the work is actually made — the Studio,
 * the Director, the storyboard — is deliberately absent, because a client
 * hiring an agency is not shopping for a tool.
 */

const HOW_IT_WORKS = [
  { icon: Sparkles, title: "Tell us about the product", body: "A short guided brief: brand, goal, audience, offer." },
  { icon: Film, title: "Choose what you want made", body: "Pick the format and how many videos you need." },
  { icon: Zap, title: "We produce it", body: "Script, creative direction, AI production, editing." },
  { icon: MessageSquare, title: "Review and talk to us", body: "Watch each cut, leave notes on the timeline, ask for changes." },
  { icon: Download, title: "Download your finals", body: "Approved files, ready for the platforms you named." },
]

export default function HireUsPage() {
  const { user } = useAuth()
  const [hasProjects, setHasProjects] = useState(false)
  const [services, setServices] = useState<OfferService[] | null>(null)

  // The catalogue is editable from the admin panel, so the page asks what is on
  // sale rather than shipping a copy of it. An admin also sees their own
  // unpublished drafts here, because the same query answers both — a separate
  // preview is a second thing that can disagree with the live page.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setServices(data.services ?? []) })
      .catch(() => { if (active) setServices([]) })
    return () => { active = false }
  }, [])

  // A returning client should land on their work, not be sold to again.
  useEffect(() => {
    if (!user) return
    let active = true
    fetch("/api/managed/projects")
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((data) => { if (active) setHasProjects(Boolean(data.projects?.length)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [user])

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="px-6 pt-32 pb-16 max-w-6xl mx-auto">
        <motion.div {...materialize} className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Clapperboard className="h-3.5 w-3.5" />
            Managed Production
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Hire Our <span className="text-primary">Creative Team</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/55 sm:text-xl">
            Give us your product and goal. We handle the script, creative direction,
            AI production, editing and delivery.
          </p>

          {hasProjects && (
            <Link
              href="/hire-us/projects"
              className="mt-7 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/80 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
            >
              Open your projects
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </motion.div>
      </section>

      <section className="px-6 pb-16 max-w-6xl mx-auto">
        {services === null ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center">
            <p className="text-sm text-white/45">
              We are not taking new projects right now. Email us and we will let you know when we reopen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {services.map((service, index) => (
              <ServiceCard key={service.key} service={service} index={index} />
            ))}
          </div>
        )}
      </section>

      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
        <p className="mt-2 text-white/45">
          Five steps, and everything complicated stays behind the curtain.
        </p>
        <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="glass-card rounded-2xl border-white/10 p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-white/35">{index + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <Footer />
    </main>
  )
}

function ServiceCard({ service, index }: { service: OfferService; index: number }) {
  const cheapest = cheapestPackage(service)
  const [playing, setPlaying] = useState(false)

  return (
    <motion.div
      {...materialize}
      transition={{ ...springUI, delay: index * 0.05 }}
      className="glass-card flex flex-col overflow-hidden rounded-2xl border-white/10"
    >
      {/* The gig's own media. A promo video plays in place on click rather than
          autoplaying: four cards autoplaying at once is four videos competing
          for bandwidth and a page that sounds like a fairground. */}
      {(service.thumbnailUrl || service.videoUrl) && (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {playing && service.videoUrl ? (
            <video
              src={service.videoUrl}
              controls
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              {service.thumbnailUrl ? (
                <img src={service.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={`${service.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
              )}
              {service.videoUrl && (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={`Play the ${service.name} showreel`}
                  className="absolute inset-0 grid place-items-center bg-black/25 transition hover:bg-black/10"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-black shadow-lg transition group-hover:scale-105">
                    <Play className="ml-0.5 h-6 w-6" />
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{service.name}</h2>
            {service.tagline && <p className="mt-1 text-sm text-primary/90">{service.tagline}</p>}
          </div>
          {cheapest && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">From</p>
              <p className="text-sm font-bold text-white">{formatUsdWithInr(cheapest.priceInr)}</p>
            </div>
          )}
        </div>

        {service.description && (
          <p className="mt-4 text-sm leading-relaxed text-white/50">{service.description}</p>
        )}

        {service.deliverables.length > 0 && (
          <ul className="mt-5 space-y-2">
            {service.deliverables.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-white/60">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        )}

        {!service.isPublished && (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
            Draft — only you can see this. Publish it in Admin → Managed Production → Offers.
          </p>
        )}

        <Link
          href={`/hire-us/brief?service=${service.key}`}
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
        >
          {service.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  )
}
