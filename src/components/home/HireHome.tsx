"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Play,
  RefreshCw,
  Tag,
} from "lucide-react"
import Footer from "@/components/Footer"
import OfferMediaFrame, { offerMediaFit } from "@/components/managed/OfferMedia"
import { useAuth } from "@/components/auth/auth-provider"
import { formatUsdWithInr } from "@/lib/currency"
import { cheapestPackage, type OfferService } from "@/lib/managed-offers"
import { materialize, springUI } from "@/lib/motion"

/**
 * The done-for-you homepage.
 *
 * Sells the outcome and nothing else. A visitor here is buying finished ads,
 * not software: there is no mention of the Studio, the Director, the models or
 * a prompt anywhere on the page, because every sentence about how the work is
 * made is a sentence asking them to become a different kind of customer — the
 * kind who has to do something.
 *
 * It carries its own header for the same reason the Originals homepage does:
 * the shared Navbar leads with a Creator Studio button, which sends the exact
 * person this page is written for into the tool they are paying not to use.
 */

/**
 * The two promises the page is built around.
 *
 * Stated here rather than read from the catalogue because they are a pitch
 * rather than a per-package field: a package carries its own revision count,
 * and where a card shows one it shows that number, not this one. Change these
 * two constants and the page changes with them.
 */
const FIRST_CUT_HOURS = 24
const REVISION_ROUNDS = 2

const PROMISES = [
  {
    icon: Clock,
    title: `First cut in ${FIRST_CUT_HOURS} hours`,
    body: "Send the brief today. Watch something tomorrow — not a status update, an actual video.",
  },
  {
    icon: RefreshCw,
    title: `${REVISION_ROUNDS} rounds of changes included`,
    body: "Leave a note on the second it applies to. We recut it. No hourly billing, no negotiating over an email.",
  },
  {
    icon: Tag,
    title: "One price, agreed first",
    body: "You pick a package and see the price before anything is charged. Bigger jobs are quoted in writing.",
  },
  {
    icon: Download,
    title: "Finished files, not projects",
    body: "Approved cuts download ready to run, in the sizes and platforms you asked for.",
  },
]

const YOUR_PART = [
  "Tell us the product, the goal and who it is for.",
  "Watch each cut and say what you want changed.",
  "Download the finals and run them.",
]

const OUR_PART = [
  "Writing the hook and the script.",
  "Casting the faces and locking the look.",
  "Producing every shot in the ad.",
  "Editing, grading, sound and captions.",
  "Cutting the sizes each platform wants.",
  "Keeping the whole set consistent.",
]

const STEPS = [
  {
    icon: FileText,
    title: "Send the brief",
    body: "A short guided form: brand, product, goal, audience, where it runs. Ten minutes, once.",
  },
  {
    icon: Play,
    title: "We make it",
    body: `Script, direction, production, edit. The first cut lands in your project within ${FIRST_CUT_HOURS} hours.`,
  },
  {
    icon: MessageSquare,
    title: "Say what to change",
    body: `Notes pinned to the timestamp they belong to, and a chat with the people doing the work. ${REVISION_ROUNDS} rounds included.`,
  },
  {
    icon: Download,
    title: "Take the files",
    body: "Approve a cut and it becomes a download. Everything stays in the project if you need it again.",
  },
]

const ANSWERS = [
  {
    question: "Do I need to know anything about AI?",
    answer:
      "No. You never see a prompt, a model or a timeline. You describe the product the way you would describe it to a person, because that is who reads it.",
  },
  {
    question: "What if the first cut is wrong?",
    answer: `That is what the ${REVISION_ROUNDS} revision rounds are for. Tell us at which second it goes wrong and what you want instead — the note sits on the frame, so nothing is lost in translation.`,
  },
  {
    question: "Where does everything live?",
    answer:
      "In your project: the chat with the team, every version we send, your notes against each one, and the approved files. Nothing moves to email unless you want it to.",
  },
]

export default function HireHome() {
  const { user } = useAuth()
  const [services, setServices] = useState<OfferService[] | null>(null)
  const [hasProjects, setHasProjects] = useState(false)

  // The catalogue is edited in the admin panel, so the page asks what is on
  // sale rather than shipping a copy of it that can go stale against the prices
  // checkout actually charges.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setServices(data.services ?? []) })
      .catch(() => { if (active) setServices([]) })
    return () => { active = false }
  }, [])

  // A client who already has work with us should be shown the way back to it
  // rather than sold the same thing twice.
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
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" />
            <span className="hidden sm:inline">AI Director <span className="text-primary">Hub</span></span>
          </Link>
          <div className="flex items-center gap-2">
            {hasProjects ? (
              <Link
                href="/hire-us/projects"
                className="flex h-10 items-center rounded-md border border-white/15 px-4 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                Your projects
              </Link>
            ) : (
              <Link
                href={user ? "/account" : "/login"}
                className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-white/55 transition hover:text-white sm:flex"
              >
                {user ? "Account" : "Sign in"}
              </Link>
            )}
            <Link
              href="/hire-us/brief"
              className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
            >
              Start a brief
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-32 sm:pt-40">
        <motion.div {...materialize} className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Clock className="h-3.5 w-3.5" />
            First cut in {FIRST_CUT_HOURS} hours
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            You sell the product.
            <br />
            <span className="text-primary">We make the ads.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/60 sm:text-xl">
            Tell us about the product once. Get finished video ads back — written, produced,
            edited and cut for wherever you run them. First cut inside {FIRST_CUT_HOURS} hours,
            {" "}{REVISION_ROUNDS} rounds of changes included, and you never open an editor.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/hire-us/brief"
              className="flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
            >
              Tell us about your product
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/hire-us"
              className="flex h-12 items-center gap-2 rounded-md border border-white/15 px-6 text-sm font-medium text-white/80 transition hover:bg-white/[0.06] hover:text-white"
            >
              See what we make
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/35">
            No call to book. No scope document. A form, and then videos.
          </p>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((promise, index) => (
            <motion.div
              key={promise.title}
              {...materialize}
              transition={{ ...springUI, delay: index * 0.05 }}
              className="glass-card rounded-2xl border-white/10 p-5"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <promise.icon className="h-4 w-4" />
              </span>
              <h2 className="mt-4 text-sm font-bold">{promise.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">{promise.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* The whole pitch in one comparison: a short list of what is asked of the
          client beside a long one of what is not. */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-5 lg:grid-cols-2">
          <motion.div {...materialize} className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-7">
            <h2 className="text-xl font-bold tracking-tight">What you do</h2>
            <p className="mt-1 text-xs text-white/40">Three things, and none of them take an afternoon.</p>
            <ul className="mt-5 space-y-3">
              {YOUR_PART.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-white/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...materialize} transition={{ ...springUI, delay: 0.05 }} className="glass-card rounded-2xl border-white/10 p-7">
            <h2 className="text-xl font-bold tracking-tight">What we do</h2>
            <p className="mt-1 text-xs text-white/40">Everything that usually needs an agency, a crew and a month.</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {OUR_PART.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-white/55">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/25" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What you can order</h2>
        <p className="mt-2 text-sm text-white/45">Pick the one that matches the job. The price you see is the price.</p>

        {services === null ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[0, 1].map((key) => (
              <div key={key} className="h-52 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/12 p-10 text-center">
            <p className="text-sm text-white/45">
              We are between intakes right now.{" "}
              <Link href="/contact" className="font-semibold text-primary hover:underline">Tell us what you need</Link>{" "}
              and we will come back to you when we reopen.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
            {services.map((service, index) => (
              <OfferCard key={service.key} service={service} index={index} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it goes</h2>
        <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              {...materialize}
              transition={{ ...springUI, delay: index * 0.05 }}
              className="glass-card rounded-2xl border-white/10 p-5"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-white/30">Step {index + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">{step.body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-20">
        <div className="space-y-3">
          {ANSWERS.map((entry) => (
            <div key={entry.question} className="glass-card rounded-2xl border-white/10 p-6">
              <h3 className="text-sm font-bold">{entry.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/50">{entry.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          {...materialize}
          className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] to-transparent p-10 text-center sm:p-14"
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Tell us about your product.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55">
            Ten minutes of typing is the whole of your involvement. The first cut is with you
            inside {FIRST_CUT_HOURS} hours.
          </p>
          <Link
            href="/hire-us/brief"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.97]"
          >
            Start a brief
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      <Footer />
    </main>
  )
}

function OfferCard({ service, index }: { service: OfferService; index: number }) {
  const cheapest = cheapestPackage(service)

  return (
    <motion.div
      {...materialize}
      transition={{ ...springUI, delay: index * 0.05 }}
      className="glass-card flex flex-col overflow-hidden rounded-2xl border-white/10"
    >
      {/* The gig's own art, muted and still, and whole — most of these are
          9:16. A homepage with four videos competing for bandwidth loads like a
          fairground, so the ones that play live on /hire-us, one click away. */}
      {(service.thumbnailUrl || service.videoUrl) && (
        <OfferMediaFrame fill={service.thumbnailUrl || undefined}>
          {service.thumbnailUrl ? (
            <img src={service.thumbnailUrl} alt="" className={offerMediaFit} />
          ) : (
            <video src={`${service.videoUrl}#t=0.1`} preload="metadata" muted playsInline className={offerMediaFit} />
          )}
        </OfferMediaFrame>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight">{service.name}</h3>
            {service.tagline && <p className="mt-1 text-sm text-primary/90">{service.tagline}</p>}
          </div>
          {cheapest && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">From</p>
              <p className="text-sm font-bold">{formatUsdWithInr(cheapest.priceInr)}</p>
            </div>
          )}
        </div>

        {service.deliverables.length > 0 && (
          <ul className="mt-5 space-y-2">
            {service.deliverables.slice(0, 3).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-white/55">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        )}

        {/* The package's own revision count, not the page's headline number:
            where the two disagree the one being sold is the true one. */}
        {cheapest && cheapest.revisions > 0 && (
          <p className="mt-4 text-xs text-white/35">
            {cheapest.revisions} revision{cheapest.revisions === 1 ? "" : "s"} included on this package.
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
