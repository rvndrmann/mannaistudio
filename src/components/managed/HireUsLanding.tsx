"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Check, Clapperboard, Hourglass, Loader2, MessageSquare, Play, Sparkles, Film, Zap, Download, PhoneCall } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import ProofWall, { type WallItem } from "@/components/home/academy/ProofWall"
import WorkGallery, { type WorkItem } from "@/components/home/academy/WorkGallery"
import BookCallButton from "@/components/managed/BookCallButton"
import { formatUsd } from "@/lib/currency"
import { cheapestPackage, publishedOffers, serviceAvailabilityNote, servicePlacement, type OfferService } from "@/lib/managed-offers"
import { materialize, springUI } from "@/lib/motion"
import OfferMediaFrame, { offerMediaFit } from "@/components/managed/OfferMedia"
import {
  embedThumbnailUrl, isEmbeddedVideo, videoEmbedUrl, youtubeFallbackThumbnailUrl,
} from "@/lib/video-embed"

/**
 * Hire Our Creative Team (rendered by app/hire-us/page.tsx, which reads the
 * proof and the booking link on the server).
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

export default function HireUsLanding({ bookCallUrl, sales, reviews, work }: {
  bookCallUrl: string
  sales: WallItem[]
  reviews: WallItem[]
  work: WorkItem[]
}) {
  const { user } = useAuth()
  const [hasProjects, setHasProjects] = useState(false)
  const [services, setServices] = useState<OfferService[] | null>(null)

  // The catalogue is editable from the admin panel, so the page asks what is on
  // sale rather than shipping a copy of it — and shows only what is published,
  // an admin included. A draft on the page that sells is a gig somebody can
  // click through to a checkout that refuses to price it; it belongs in Admin →
  // Managed Production → Offers, which reads the catalogue unfiltered.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setServices(publishedOffers(data.services ?? [])) })
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

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#packages"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
            >
              See packages
              <ArrowRight className="h-4 w-4" />
            </a>
            {bookCallUrl && <BookCallButton href={bookCallUrl} placement="hero" className="h-11" />}
            {hasProjects && (
              <Link
                href="/hire-us/projects"
                className="inline-flex h-11 items-center gap-2 px-2 text-sm font-medium text-white/60 underline-offset-4 transition hover:text-white hover:underline"
              >
                Open your projects
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          {bookCallUrl && (
            <p className="mt-3 text-xs text-white/40">Not sure which package fits? Talk it through with us first. No charge.</p>
          )}
        </motion.div>
      </section>

      {/* What clients paid and what they said, as published in /admin/proof.
          Nothing published, no section: there is no placeholder version. */}
      {(sales.length > 0 || reviews.length > 0) && (
        <section id="proof" className="scroll-mt-24 px-6 pb-20 max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Results and reviews</h2>
          <p className="mt-2 text-white/45">Real payments and real words, shared with the permission of the people shown.</p>
          <ProofWall students={reviews} sales={sales} lead="sales" />
        </section>
      )}

      {work.length > 0 && (
        <section className="px-6 pb-20 max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Work we have made</h2>
          <p className="mt-2 text-white/45">Ads and films produced by the team.</p>
          <WorkGallery items={work} />
        </section>
      )}

      <section id="packages" className="scroll-mt-24 px-6 pb-16 max-w-6xl mx-auto">
        <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Packages</h2>
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
              <ServiceCard key={service.key} service={service} index={index} bookCallUrl={bookCallUrl} />
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

      {bookCallUrl && (
        <section className="px-6 pb-24 max-w-6xl mx-auto">
          <div className="glass-card flex flex-col items-start gap-5 rounded-2xl border-white/10 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Want to talk before you order?</h2>
              <p className="mt-2 max-w-xl text-sm text-white/50">
                Book a free call. Tell us about the product and the campaign, and we will tell you which package fits, or if none does.
              </p>
            </div>
            <BookCallButton href={bookCallUrl} placement="closing" className="h-11 shrink-0 border-primary/40 bg-primary text-black hover:bg-primary hover:text-black hover:brightness-110" />
          </div>
        </section>
      )}

      <Footer />
    </main>
  )
}

function ServiceCard({ service, index, bookCallUrl }: { service: OfferService; index: number; bookCallUrl: string }) {
  const cheapest = cheapestPackage(service)
  // Slots are counted per tier; the card shows the gig's best answer — open if
  // any tier has a live slot, queueing if any can still be booked.
  const placement = servicePlacement(service)
  const availability = serviceAvailabilityNote(service)
  const [playing, setPlaying] = useState(false)
  const [posterMissing, setPosterMissing] = useState(false)

  // A promo can be an uploaded file or a link to one that lives on YouTube or
  // Instagram. Only the file can be played by a `<video>` element; a link needs
  // the platform's own player in an iframe, which is why a gig pointing at a
  // reel used to show a black rectangle with a play button that did nothing.
  const embed = videoEmbedUrl(service.videoUrl, { autoplay: true, controls: true })
  const linked = isEmbeddedVideo(service.videoUrl)
  // YouTube publishes a still for every video, so a gig can point at one and
  // still have a poster without uploading anything. Instagram publishes none,
  // so a reel falls back to the gig's own thumbnail, and to the play badge on
  // black when there is not one.
  const derivedPoster = posterMissing
    ? youtubeFallbackThumbnailUrl(service.videoUrl)
    : embedThumbnailUrl(service.videoUrl)
  const poster = service.thumbnailUrl || derivedPoster || ""

  return (
    <motion.div
      {...materialize}
      transition={{ ...springUI, delay: index * 0.05 }}
      className="glass-card flex flex-col overflow-hidden rounded-2xl border-white/10"
    >
      {/* The gig's own media. A promo video plays in place on click rather than
          autoplaying: four cards autoplaying at once is four videos competing
          for bandwidth and a page that sounds like a fairground. */}
      {(poster || service.videoUrl) && (
        <OfferMediaFrame fill={poster || undefined}>
          {playing && service.videoUrl ? (
            embed ? (
              // The frame is fitted rather than filled, so the player is given
              // the whole band and keeps its own shape inside it.
              <iframe
                src={embed}
                title={`${service.name} showreel`}
                className="h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <video
                src={service.videoUrl}
                controls
                autoPlay
                playsInline
                className={offerMediaFit}
              />
            )
          ) : (
            <>
              {poster ? (
                <img
                  src={poster}
                  alt=""
                  onError={() => setPosterMissing(true)}
                  className={offerMediaFit}
                />
              ) : linked ? (
                // A reel with no thumbnail: nothing to show but the invitation.
                <span className="absolute inset-0" />
              ) : (
                <video src={`${service.videoUrl}#t=0.1`} preload="metadata" muted playsInline className={offerMediaFit} />
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
        </OfferMediaFrame>
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
              <p className="text-sm font-bold text-white">{formatUsd(cheapest.priceInr)}</p>
            </div>
          )}
        </div>

        {availability && (
          <p
            className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              placement === "sold_out"
                ? "border-red-400/30 bg-red-500/10 text-red-200"
                : placement === "queue"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  : "border-primary/30 bg-primary/10 text-primary"
            }`}
          >
            {placement === "queue" ? <Hourglass className="h-3 w-3" /> : null}
            {availability}
          </p>
        )}

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

        {placement === "sold_out" ? (
          <span
            aria-disabled="true"
            className="mt-6 flex h-11 cursor-not-allowed items-center justify-center rounded-md border border-white/12 px-5 text-sm font-semibold text-white/40"
          >
            Sold out
          </span>
        ) : (
          <Link
            href={`/hire-us/brief?service=${service.key}`}
            className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
          >
            {placement === "queue" ? "Book a place in the queue" : service.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {bookCallUrl && (
          <BookCallButton
            href={bookCallUrl}
            placement={`service:${service.key}`}
            className="mt-2 h-10 border-transparent bg-transparent text-white/55"
          >
            <PhoneCall className="h-3.5 w-3.5" /> Questions first? Book a call
          </BookCallButton>
        )}
      </div>
    </motion.div>
  )
}
