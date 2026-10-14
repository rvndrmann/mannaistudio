import { formatUsdFromInr, PRO_PRICE_USD_LABEL, showRupeesAsDollars } from "@/lib/display-currency"
import Link from "next/link"
import { unstable_cache } from "next/cache"
import { cookies } from "next/headers"
import type { ReactNode } from "react"
import { ArrowRight, ArrowUpRight, Check, Plus, Quote } from "lucide-react"
import Footer from "@/components/Footer"
import AcademyNavbar from "@/components/AcademyNavbar"
import HeroReel from "@/components/home/academy/HeroReel"
import ProofWall from "@/components/home/academy/ProofWall"
import WorkGallery from "@/components/home/academy/WorkGallery"
import { FreeCourseCta, ProCta, StickyProBar, ViewContentBeacon } from "@/components/home/academy/cta"
import { reasonVisuals } from "@/components/home/academy/reason-visuals"
import { courseMetaLine, fetchCatalogCourses, type CatalogCourse } from "@/lib/course-catalog"
import { fetchBillingSettings } from "@/lib/membership"
import {
  createPublicClient,
  fetchProofPageSettings,
  fetchPublishedProof,
  formatProofAmount,
  isPlayableFile,
  proofCategoryLabel,
  proofPoster,
  toWallItem,
  type ProofItem,
} from "@/lib/proof"

/**
 * The homepage Instagram traffic lands on.
 *
 * Rendered on the server, all of it. The page this replaced fetched its own
 * content in the browser, so what Google, an AI crawler and every link preview
 * actually received was "Featured work is being curated" — the placeholder for
 * a request that had not been made yet.
 *
 * Two rules run through every section below:
 *
 *   Proof is whatever is published in /admin/proof and nothing else. A section
 *   with no rows behind it is not rendered — there is no placeholder to fall
 *   back to, because a placeholder testimonial is an invented one.
 *
 *   One thing is for sale. Every primary button is the Pro subscription and
 *   every secondary link is the free course.
 */

export const academyMetadata = {
  title: "AI Director Hub | Learn AI Filmmaking and Direct AI Films",
  description: `Don't prompt for one lucky clip. Learn the workflow, then direct client-grade AI video in Creator Studio with your own API keys. AI Director Hub Pro: all courses, Creator Studio and the AI Director Agent for ${PRO_PRICE_USD_LABEL}/month.`,
}

const transformations = [
  ["Random prompts", "Intentional shots"],
  ["Inconsistent characters", "Character consistency"],
  ["Generic AI movement", "Controlled cinematography"],
  ["Disconnected clips", "Complete sequences"],
  ["Basic generations", "Professional editing"],
  ["Flat audio", "Cinematic sound design"],
  ["AI experimentation", "Repeatable production workflow"],
]

/** Facts already stated elsewhere on the page — nothing here is a claim about results. */
const facts = [
  [PRO_PRICE_USD_LABEL, "per month for everything in Pro"],
  ["4", "model providers in one studio"],
  ["$0", "markup on generation"],
]

const offerChecklist = [
  "All courses",
  "Creator Studio",
  "AI Director Agent",
  "Your own API keys, no markup",
  "New courses while subscribed",
  "Cancel anytime",
]

type Reason = { key: keyof typeof reasonVisuals; title: string; body: string }

const reasons: Reason[] = [
  { key: "shots", title: "Design the shot", body: "Framing, camera movement and lighting. Every generation is a decision you made, not a result you got." },
  { key: "faces", title: "Keep the same face", body: "One character across scenes, outfits and angles. That is what turns a clip into a campaign a client can run." },
  { key: "director", title: "Plan with your AI Director", body: "Idea, script, characters, storyboard, generation. You review the plan and approve it before anything runs." },
  { key: "models", title: "Use every top model", body: "OpenAI, Google Gemini, fal.ai and BytePlus (Seedance) in one studio. No tab juggling, no re-uploading references." },
  { key: "keys", title: "Pay the real price", body: "Connect your own provider accounts and pay them directly. We add nothing on top of generation." },
  { key: "workflow", title: "Finish the film", body: "Idea, script, shots, edit and sound design. The whole production, not only the generating part." },
  { key: "founder", title: "Learn from client work", body: "Founder Ravinder has spent 2 years producing AI video for brands in India and the US. The courses teach the workflow that work runs on." },
  { key: "community", title: "Work alongside other directors", body: "A community for Pro members. Share work in progress, compare workflows and get unstuck faster." },
]

/**
 * Everything the page reads, held for a minute.
 *
 * The page itself is rendered per request — the navigation depends on the
 * visitor's cookie — but none of this does, and three database round trips in
 * front of the first byte is most of what a landing page's load time is made
 * of. A minute is how long an edit in /admin/proof can take to appear.
 */
const loadHomeContent = unstable_cache(
  async () => {
    const supabase = createPublicClient()
    const [proof, settings, courses, billing] = await Promise.all([
      fetchPublishedProof(supabase, { limit: 100 }),
      fetchProofPageSettings(supabase),
      fetchCatalogCourses(supabase),
      fetchBillingSettings(supabase),
    ])
    return { proof, settings, courses, offerText: billing.offerEnabled ? showRupeesAsDollars(billing.offerText) : "" }
  },
  ["academy-home-content"],
  { revalidate: 60 },
)

export default async function AcademyHome() {
  const [{ proof, settings, courses, offerText }, cookieStore] = await Promise.all([loadHomeContent(), cookies()])

  // Whether a session cookie exists, not whether it is valid: enough to draw
  // the right navigation on the first paint without a round trip to verify it.
  const signedInHint = cookieStore.getAll().some((cookie) => /^sb-.+-auth-token/.test(cookie.name))

  const portfolio = proof.filter((item) => item.type === "portfolio" && item.video && proofPoster(item))
  const students = proof.filter((item) => item.type === "student_review")
  const sales = proof.filter((item) => item.type === "sale_proof")
  const featured = proof.filter((item) => item.featured).slice(0, 6)

  const reelSource = portfolio.filter(isPlayableFile)
  const heroClips = (reelSource.some((item) => item.featured) ? reelSource.filter((item) => item.featured) : reelSource)
    .slice(0, 4)
    .map((item) => ({ id: item.id, title: item.title, label: proofCategoryLabel(item.category), video: item.video, poster: proofPoster(item) }))

  const freeCourse = courses.find((course) => course.isFree)
  const proCourse = courses.find((course) => !course.isFree)
  const shownReasons = reasons.filter((reason) => reason.key !== "community" || settings.showCommunityReason)
  const demoIsVideo = /\.(mp4|webm|mov)(\?|$)/i.test(settings.studioDemoUrl)

  const faqs: Array<{ question: string; answer: ReactNode; text: string }> = [
    {
      question: "I'm a complete beginner — is this for me?",
      text: "Yes. Start with the free mini course; the crash course then walks you through the workflow step by step.",
      answer: <>Yes. Start with the <FreeCourseCta placement="faq" className="inline min-h-0 text-white underline">free mini course</FreeCourseCta>; the crash course then walks you through the workflow step by step.</>,
    },
    {
      question: "What is an API key and do I need one?",
      text: "An API key connects your own OpenAI, Gemini, fal.ai or BytePlus account to Creator Studio. A funded provider account is required for generation, and an active subscription is required to use your keys in the studio. Your provider bills you directly for AI chat, images and videos.",
      answer: <>An API key connects your own OpenAI, Gemini, fal.ai or BytePlus account to Creator Studio. A funded provider account is required for generation, and an active subscription is required to use your keys in the studio. Your provider bills you directly for AI chat, images and videos.{settings.apiGuideUrl && <> <a href={settings.apiGuideUrl} className="text-white underline underline-offset-4">Read the setup guide →</a></>}</>,
    },
    {
      question: "How much will generation cost me?",
      text: `You pay your provider directly at their prices, with no markup from us.${settings.costExample ? ` ${settings.costExample}` : ""}`,
      answer: <>You pay your provider directly at their prices, with no markup from us.{settings.costExample && <> {settings.costExample}</>}</>,
    },
    {
      question: "What do I get with Pro?",
      text: "All published courses, new courses while you are subscribed, Creator Studio and the AI Director Agent.",
      answer: "All published courses, new courses while you are subscribed, Creator Studio and the AI Director Agent.",
    },
    {
      question: "Can I cancel?",
      text: "Yes, anytime. Your access continues until the end of the period you have paid for.",
      answer: "Yes, anytime. Your access continues until the end of the period you have paid for.",
    },
    {
      question: "Refunds?",
      // The wording of /refund, not a summary of it.
      text: "As the subscription grants immediate access to digital content, the current billing cycle is generally non-refundable once started. If you were charged in error, charged after cancelling, or could not access the content due to a technical issue on our side, contact us within 7 days of the charge and we will review and, where applicable, issue a full or partial refund.",
      answer: <>As the subscription grants immediate access to digital content, the current billing cycle is generally non-refundable once started. If you were charged in error, charged after cancelling, or could not access the content due to a technical issue on our side, contact us within 7 days of the charge and we will review and, where applicable, issue a full or partial refund. <Link href="/refund" className="text-white underline underline-offset-4">Read the full policy →</Link></>,
    },
  ]

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.text } })),
  }

  const pad = "px-5 sm:px-8"
  const cell = "border-white/[.08]"

  return (
    <main className="min-h-screen bg-background pb-20 text-white md:pb-0">
      {/* The academy bar directly, not the shared Navbar that would hand over
          to it: that one carries the other site's menu, its animation library
          and three settings requests, none of which this page uses. */}
      <AcademyNavbar offerText={offerText} signedInHint={signedInHint} />
      <ViewContentBeacon name="Homepage" />
      <StickyProBar watch="hero" />

      {/* 1. Hero */}
      <section id="hero" className={`frame ${pad} pb-16 pt-32 sm:pt-40 lg:pb-24`}>
        <div className={`grid gap-12 lg:items-center ${heroClips.length ? "lg:grid-cols-[1.1fr_.9fr]" : ""}`}>
          <div>
            <p className="inline-flex items-center gap-2.5 rounded-md border border-white/10 bg-white/[.03] px-3 py-1.5 text-xs text-white/55">
              Pro <span className="font-medium text-brand">{PRO_PRICE_USD_LABEL} / month</span><span className="h-3 w-px bg-white/15" />cancel anytime
            </p>
            <h1 className="mt-7 max-w-2xl text-[2.5rem] font-medium leading-[1.08] tracking-[-0.05em] text-white/95 sm:text-[3.25rem]">Don&apos;t prompt for one lucky clip. Direct the whole film.</h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/60">Learn the workflow, then make client-grade AI video in one studio. Scripts, characters, storyboards, images and video, on your own API keys.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ProCta placement="hero" className="w-full sm:w-auto" />
              <FreeCourseCta placement="hero" className={`${outlineButton} w-full justify-center sm:w-auto`}>Start the free course</FreeCourseCta>
            </div>
            {settings.costExample && (
              <div className="mt-8 max-w-lg border-l border-white/20 pl-4">
                <p className="text-sm font-medium text-white/90">Your own API key means you pay the real price.</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{settings.costExample}</p>
              </div>
            )}
          </div>
          {heroClips.length > 0 && <HeroReel clips={heroClips} />}
        </div>
      </section>

      {/* 2. Proof strip */}
      {featured.length > 0 && (
        <section aria-label="Featured proof" className="frame frame-row">
          <p className="py-6 text-center text-[11px] font-medium uppercase tracking-[.22em] text-white/35">Featured work and results</p>
          <ul className={`flex snap-x overflow-x-auto border-t ${cell} [scrollbar-width:none] lg:grid lg:grid-cols-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden`}>
            {featured.map((item) => {
              const image = item.type === "portfolio" ? proofPoster(item) : item.avatarImage || proofPoster(item)
              const amount = formatProofAmount(item.amount, item.currency)
              return (
                <li key={item.id} className={`w-56 shrink-0 snap-start border-r ${cell} last:border-r-0 lg:w-auto`}>
                  <a href={item.type === "portfolio" ? "#work" : "#proof"} className="flex h-full items-center gap-3 p-4 transition hover:bg-white/[.03]">
                    {image
                      ? <img src={image} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                      : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-white/[.06] text-white/60"><Quote className="h-4 w-4" /></span>}
                    <span className="min-w-0">
                      <span className="block text-[11px] text-white/40">{item.type === "portfolio" ? proofCategoryLabel(item.category) : item.type === "sale_proof" ? <>Client sale{amount && <> · <span className="text-brand">{amount}</span></>}</> : "Student result"}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">{item.type === "portfolio" ? item.title : item.personName || item.title}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* The offer, as three figures */}
      <section aria-label="Pro at a glance" className="frame frame-row">
        <dl className="grid sm:grid-cols-3">
          {facts.map(([figure, label]) => (
            <div key={label} className={`border-b ${cell} bg-white/[.02] px-5 py-7 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:last:border-r-0`}>
              <dd className="text-4xl font-medium tracking-[-0.04em]">{figure}</dd>
              <dt className="mt-2 text-xs text-white/45">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* 3. Proof wall */}
      {(students.length > 0 || sales.length > 0) && (
        <section id="proof" className={`frame frame-row scroll-mt-24 ${pad} py-20`}>
          <SectionTitle eyebrow="Proof" title="Results from students and clients" body="Shared with the permission of the people shown." />
          <ProofWall students={students.map(toWallItem)} sales={sales.map(toWallItem)} />
        </section>
      )}

      {/* 4. The craft */}
      <section className="frame frame-row">
        <div className={`${pad} py-20`}>
          <SectionTitle eyebrow="The difference" title="Built for people who want to direct, not gamble" body="Models change every month. Creative judgment and a repeatable process keep paying off." />
        </div>
        <ul className={`grid border-t ${cell} sm:grid-cols-2 lg:grid-cols-3`}>
          {transformations.map(([before, after]) => (
            <li key={before} className={`flex items-center justify-between gap-3 border-b ${cell} px-5 py-5 sm:border-r sm:px-8`}>
              <span className="text-sm text-white/40 line-through decoration-white/20">{before}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <span className="text-right text-sm text-white/90">{after}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Client-grade work */}
      {portfolio.length > 0 && (
        <section id="work" className={`frame scroll-mt-24 ${pad} py-20`}>
          <SectionTitle eyebrow="Client-grade work" title="Made with the workflow you'll learn" body="Every piece was directed shot by shot. The image, the movement, the edit and the sound." />
          <WorkGallery items={portfolio.map((item) => ({ id: item.id, title: item.title, label: proofCategoryLabel(item.category), video: item.video, poster: proofPoster(item) }))} />
        </section>
      )}

      {/* 6. AI Director Agent */}
      <section className={`frame frame-row ${pad} py-20`}>
        <div className={`grid border ${cell} bg-white/[.02] ${settings.studioDemoUrl ? "lg:grid-cols-[.9fr_1.1fr]" : ""}`}>
          <div className="p-7 sm:p-10">
            <p className="text-xs text-white/40">Your AI Director Agent</p>
            <h2 className="mt-4 text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-[2rem]">Give your idea a director.</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">Tell your AI Director what you want to make. It develops the idea, writes the script, plans characters and storyboards, and generates images and video across supported models. You approve the plan before anything runs.</p>
            <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-white/40">
              {["Your idea", "AI Director", "Finished video"].map((step, position) => (
                <span key={step} className="inline-flex items-center gap-2">{position > 0 && <ArrowRight className="h-3 w-3" />}<span className={position === 1 ? "text-white/85" : ""}>{step}</span></span>
              ))}
            </p>
          </div>
          {settings.studioDemoUrl && (
            <div className={`border-t ${cell} bg-black lg:border-l lg:border-t-0`}>
              {demoIsVideo
                ? <video src={settings.studioDemoUrl} poster={settings.studioDemoPoster || undefined} controls muted playsInline preload="none" aria-label="Creator Studio in use" className="aspect-video h-full w-full" />
                : <img src={settings.studioDemoUrl} alt="Creator Studio in use" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
            </div>
          )}
          <ul className={`grid border-t ${cell} sm:grid-cols-3 lg:col-span-full`}>
            {["Develop ideas and write scripts", "Plan characters, assets and storyboards", "Generate images and video with your API keys"].map((feature) => (
              <li key={feature} className={`border-b ${cell} px-7 py-4 text-sm text-white/70 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0`}>{feature}</li>
            ))}
          </ul>
          <div className={`flex items-center justify-between gap-4 border-t ${cell} px-7 py-5 lg:col-span-full`}>
            <Link href="/studio" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition hover:bg-white">Meet your AI Director <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            <span className="hidden text-xs text-white/40 sm:block">Included in Pro</span>
          </div>
        </div>
      </section>

      {/* 7. Why creators choose AI Director Hub */}
      <section className={`frame frame-row ${pad} py-20`}>
        <SectionTitle eyebrow="How it works" title="From first idea to finished film" />
        <ol className="mt-14 space-y-16 lg:space-y-24">
          {shownReasons.map((reason, position) => (
            <li key={reason.key}>
              <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-14">
                <div>
                  <p className="text-xs tabular-nums text-white/35">{String(position + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-2xl font-medium tracking-[-0.03em]">{reason.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55">{reason.body}</p>
                  {reason.key === "keys" && settings.costExample && <p className="mt-4 max-w-md border-l border-white/20 pl-4 text-sm text-white/70">{settings.costExample}</p>}
                </div>
                <div>
                  {reason.key === "founder" && sales.length > 0
                    ? <FounderProof items={sales.slice(0, 3)} />
                    : reasonVisuals[reason.key]}
                </div>
              </div>
              {(position === 2 || position === 6) && (
                <div className={`mt-14 flex flex-wrap items-center justify-between gap-4 border ${cell} bg-white/[.02] p-6`}>
                  <p className="text-sm text-white/70">Everything on this page is in Pro.</p>
                  <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                    <ProCta placement={`reasons-${position + 1}`} className="w-full sm:w-auto" />
                    <FreeCourseCta placement={`reasons-${position + 1}`} className={`${outlineButton} w-full justify-center sm:w-auto`}>Start the free course</FreeCourseCta>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* 8. Courses */}
      {(freeCourse || proCourse) && (
        <section id="courses" className={`frame frame-row scroll-mt-24 ${pad} py-20`}>
          <SectionTitle eyebrow="Courses" title="Start free. Go deeper with Pro." body="Shot design, character consistency, prompting, editing and the production workflow." />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {freeCourse && <CourseCard course={freeCourse} />}
            {proCourse && <CourseCard course={proCourse} />}
          </div>
          <Link href="/courses" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-white/70 transition hover:text-white">View all courses <ArrowRight className="h-3.5 w-3.5" /></Link>
        </section>
      )}

      {/* 9. Offer */}
      <section id="pricing" className={`frame frame-row scroll-mt-24 ${pad} py-20`}>
        <SectionTitle eyebrow="Pricing" title="One plan. Everything included." />
        <div className={`mt-10 grid border ${cell} ${settings.showAnnualPlan && settings.annualPrice ? "md:grid-cols-2" : "max-w-xl"}`}>
          <div className="bg-white/[.03] p-7 sm:p-9">
            <p className="flex items-center justify-between text-lg font-medium tracking-[-0.02em]">Monthly <span className="rounded-sm border border-brand/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.12em] text-brand">Pro</span></p>
            <p className="mt-8 flex items-baseline gap-2"><span className="text-5xl font-medium tracking-[-0.04em]">{PRO_PRICE_USD_LABEL}</span><span className="text-sm text-white/45">/ month</span></p>
            <ul className={`mt-8 space-y-3.5 border-t ${cell} pt-7`}>
              {offerChecklist.map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm text-white/75"><Check className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />{line}</li>
              ))}
            </ul>
            <ProCta placement="pricing" className="mt-9 w-full" />
            <div className="mt-2 text-center"><FreeCourseCta placement="pricing" /></div>
          </div>
          {settings.showAnnualPlan && settings.annualPrice && (
            <div className={`flex flex-col border-t ${cell} p-7 sm:p-9 md:border-l md:border-t-0`}>
              <p className="text-lg font-medium tracking-[-0.02em]">Annual</p>
              <p className="mt-8 flex items-baseline gap-2"><span className="text-5xl font-medium tracking-[-0.04em]">{formatUsdFromInr(settings.annualPrice)}</span><span className="text-sm text-white/45">/ year</span></p>
              <p className="mt-4 text-sm leading-relaxed text-white/55">Everything in Pro, billed once a year.</p>
              <ProCta placement="pricing-annual" className={`${outlineButton} mt-auto w-full justify-center bg-transparent text-white hover:bg-white/[.06]`}>Choose annual <ArrowRight className="h-3.5 w-3.5" /></ProCta>
            </div>
          )}
        </div>
      </section>

      {/* 10. FAQ */}
      <section id="faq" className={`frame frame-row scroll-mt-24 ${pad} py-20`}>
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionTitle eyebrow="FAQ" title="Your questions answered" body="What Pro includes, what your provider bills you for, and how to leave." />
            <ProCta placement="faq" className="mt-7" />
          </div>
          <div className={`border-t ${cell}`}>
            {faqs.map((faq) => (
              <details key={faq.question} className={`group border-b ${cell}`}>
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base text-white/90 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <Plus className="h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-45" />
                </summary>
                <p className="pb-6 pr-8 text-sm leading-relaxed text-white/55">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      </section>

      {/* 11. Final CTA — the one light surface on the page */}
      <section className="frame frame-row">
        <div className="grid gap-8 bg-[#f4f4f4] px-5 py-12 text-[#151515] sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs text-black/45">Get started</p>
            <h2 className="mt-4 max-w-xl text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-[2.25rem]">Clients don&apos;t pay for prompts. They pay for direction.</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-black/55">Creative judgment, reliable execution and work that stands out. Start building that skill today.</p>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-64">
            <ProCta placement="final" className="w-full justify-between bg-[#151515] text-white hover:bg-black" />
            <FreeCourseCta placement="final" className="h-12 w-full justify-between rounded-md border border-black/15 bg-white px-5 text-[13px] font-medium text-[#151515] no-underline hover:border-black/40 hover:text-[#151515] hover:no-underline">Start the free course <ArrowUpRight className="h-3.5 w-3.5" /></FreeCourseCta>
          </div>
        </div>
      </section>

      <Footer flush />
    </main>
  )
}

const outlineButton = "h-12 rounded-md border border-white/15 bg-white/[.03] px-5 text-[13px] font-medium text-white/90 no-underline transition hover:border-white/30 hover:bg-white/[.06] hover:text-white hover:no-underline"

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <header>
      <p className="text-xs text-white/40">{eyebrow}</p>
      <h2 className="mt-4 max-w-xl text-3xl font-medium leading-tight tracking-[-0.04em] text-white/95 sm:text-[2rem]">{title}</h2>
      {body && <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55">{body}</p>}
    </header>
  )
}

function CourseCard({ course }: { course: CatalogCourse }) {
  const meta = courseMetaLine(course)
  return (
    <article className="flex flex-col overflow-hidden border border-white/[.08] bg-white/[.02]">
      <div className="relative aspect-video bg-[#111]">
        {course.thumbnail && <img src={course.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        <span className={`absolute left-3 top-3 rounded-sm px-2.5 py-1 text-[11px] font-medium ${course.isFree ? "bg-primary text-primary-foreground" : "bg-black/70 text-white/85 backdrop-blur-sm"}`}>{course.isFree ? "Free" : "Included in Pro"}</span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {meta && <p className="text-xs text-white/45">{meta}</p>}
        <h3 className="mt-2 text-xl font-medium tracking-[-0.02em]">{course.title}</h3>
        {course.description && <p className="mt-2 text-sm leading-relaxed text-white/55">{course.description}</p>}
        <div className="mt-auto pt-6">
          {course.isFree
            ? <FreeCourseCta placement="course-card" className="h-10 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground no-underline hover:bg-white hover:text-primary-foreground hover:no-underline">Start free <ArrowRight className="h-3.5 w-3.5" /></FreeCourseCta>
            : <Link href={`/courses/${course.id}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 px-4 text-[13px] font-medium transition hover:border-white/30 hover:bg-white/[.06]">See the course <ArrowRight className="h-3.5 w-3.5" /></Link>}
        </div>
      </div>
    </article>
  )
}

/** Reason 7's visual when there are published client sales to show for it. */
function FounderProof({ items }: { items: ProofItem[] }) {
  return (
    <ul className="border border-white/[.08]">
      {items.map((item) => {
        const image = item.screenshots[0]?.thumb || proofPoster(item) || item.avatarImage
        const amount = formatProofAmount(item.amount, item.currency)
        return (
          <li key={item.id} className="border-b border-white/[.08] last:border-b-0">
            <a href="#proof" className="flex items-center gap-4 p-4 transition hover:bg-white/[.03]">
              {image && <img src={image} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-md object-cover" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.title || item.personName}</span>
                {item.personRole && <span className="block truncate text-xs text-white/45">{item.personRole}</span>}
              </span>
              {amount && <span className="ml-auto shrink-0 text-sm font-medium text-brand">{amount}</span>}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
