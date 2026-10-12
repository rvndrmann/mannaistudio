import Link from "next/link"
import { unstable_cache } from "next/cache"
import { cookies } from "next/headers"
import type { ReactNode } from "react"
import { ArrowRight, Check, ChevronDown, Film, Quote } from "lucide-react"
import Footer from "@/components/Footer"
import AcademyNavbar from "@/components/AcademyNavbar"
import HeroReel from "@/components/home/academy/HeroReel"
import ProofWall, { type WallItem } from "@/components/home/academy/ProofWall"
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
  description: "Stop generating random AI clips. Learn the workflow, then make client-grade AI videos in Creator Studio with your own API keys. AI Director Hub Pro: all courses, Creator Studio and the AI Director Agent for ₹799/month.",
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
  { key: "shots", title: "Intentional shots, not lucky prompts", body: "Shot design, camera movement and lighting, so every generation is a decision you made rather than a result you got." },
  { key: "faces", title: "Characters that keep the same face", body: "Consistency across scenes, outfits and angles — the difference between a clip and something a client can run as a campaign." },
  { key: "director", title: "An AI Director that plans with you", body: "Idea → script → characters → storyboard → generation. You review the plan and approve it before anything runs." },
  { key: "models", title: "Every top model in one studio", body: "OpenAI, Google Gemini, fal.ai and BytePlus (Seedance), without juggling tabs or re-uploading your references to each one." },
  { key: "keys", title: "Your own keys. Zero markup.", body: "Connect your own provider accounts and pay them directly at their real prices. Nothing is added on top of generation." },
  { key: "workflow", title: "The full workflow", body: "Idea, script, shots, edit and cinematic sound design — the whole production, not only the generating part." },
  { key: "founder", title: "Built by someone who sells AI video", body: "Founder Ravinder has spent 2 years producing AI video for brands in India and the US. The courses teach the workflow that work runs on." },
  { key: "community", title: "Learn with other AI directors", body: "A community for Pro members: share work in progress, compare workflows and get unstuck faster." },
]

function toWallItem(item: ProofItem): WallItem {
  return {
    id: item.id,
    title: item.title,
    personName: item.personName,
    personRole: item.personRole,
    avatar: item.avatarImage,
    quote: item.quote,
    screenshots: item.screenshots,
    video: item.video,
    poster: proofPoster(item),
    amount: formatProofAmount(item.amount, item.currency),
    date: item.date ? new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : "",
  }
}

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
    return { proof, settings, courses, offerText: billing.offerEnabled ? billing.offerText : "" }
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
      answer: <>Yes. Start with the <FreeCourseCta placement="faq" className="inline min-h-0 text-primary">free mini course</FreeCourseCta>; the crash course then walks you through the workflow step by step.</>,
    },
    {
      question: "What is an API key and do I need one?",
      text: "An API key connects your own OpenAI, Gemini, fal.ai or BytePlus account to Creator Studio. A funded provider account is required for generation, and an active subscription is required to use your keys in the studio. Your provider bills you directly for AI chat, images and videos.",
      answer: <>An API key connects your own OpenAI, Gemini, fal.ai or BytePlus account to Creator Studio. A funded provider account is required for generation, and an active subscription is required to use your keys in the studio. Your provider bills you directly for AI chat, images and videos.{settings.apiGuideUrl && <> <a href={settings.apiGuideUrl} className="font-semibold text-primary hover:underline">Read the setup guide →</a></>}</>,
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
      answer: <>As the subscription grants immediate access to digital content, the current billing cycle is generally non-refundable once started. If you were charged in error, charged after cancelling, or could not access the content due to a technical issue on our side, contact us within 7 days of the charge and we will review and, where applicable, issue a full or partial refund. <Link href="/refund" className="font-semibold text-primary hover:underline">Read the full policy →</Link></>,
    },
  ]

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.text } })),
  }

  return (
    <main className="min-h-screen bg-[#070807] pb-20 text-white md:pb-0">
      {/* The academy bar directly, not the shared Navbar that would hand over
          to it: that one carries the other site's menu, its animation library
          and three settings requests, none of which this page uses. */}
      <AcademyNavbar offerText={offerText} signedInHint={signedInHint} />
      <ViewContentBeacon name="Homepage" />
      <StickyProBar watch="hero" />

      {/* 1. Hero */}
      <section id="hero" className="relative isolate overflow-hidden px-5 pb-14 pt-28 sm:px-8 sm:pt-36 lg:pb-20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(196,245,43,0.10),transparent_55%)]" />
        <div className={`mx-auto grid w-full max-w-7xl gap-10 lg:items-center ${heroClips.length ? "lg:grid-cols-[1.15fr_.85fr]" : ""}`}>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold tracking-[.14em] text-primary"><Film className="h-4 w-4" /> AI FILMMAKING · CREATOR STUDIO</span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Stop generating random AI clips. <span className="text-primary">Start directing AI films.</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">Learn the workflow, then make client-grade AI videos in one studio — scripts, characters, storyboards, images and video, using your own API keys.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ProCta placement="hero" className="w-full sm:w-auto" />
              <FreeCourseCta placement="hero" />
            </div>
            {settings.costExample && <p className="mt-6 max-w-xl rounded-lg border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-white/80">{settings.costExample}</p>}
            <p className="mt-6 text-xs text-white/50">Cancel anytime · Your own API keys · No markup on generation</p>
          </div>
          {heroClips.length > 0 && <HeroReel clips={heroClips} />}
        </div>
      </section>

      {/* 2. Proof strip */}
      {featured.length > 0 && (
        <section aria-label="Featured proof" className="border-y border-white/5 bg-white/[.02] px-5 py-6 sm:px-8">
          <ul className="mx-auto flex max-w-7xl snap-x gap-3 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {featured.map((item) => {
              const image = item.type === "portfolio" ? proofPoster(item) : item.avatarImage || proofPoster(item)
              const amount = formatProofAmount(item.amount, item.currency)
              return (
                <li key={item.id} className="w-56 shrink-0 snap-start lg:w-auto">
                  <a href={item.type === "portfolio" ? "#work" : "#proof"} className="flex h-full items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-2.5 transition hover:border-primary/40">
                    {image
                      ? <img src={image} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Quote className="h-5 w-5" /></span>}
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-primary">{item.type === "portfolio" ? proofCategoryLabel(item.category) : item.type === "sale_proof" ? `Client sale${amount ? ` · ${amount}` : ""}` : "Student result"}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-white/80">{item.type === "portfolio" ? item.title : item.personName || item.title}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* 3. The craft */}
      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="THE DIFFERENCE" title="Stop Generating Clips. Start Directing AI Videos." body="Tools and models will change. Creative judgment and a repeatable production process keep paying off." />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {transformations.map(([before, after]) => (
              <div key={before} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                <span className="text-sm text-white/50">{before}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-right text-sm font-semibold">{after}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Client-grade work */}
      {portfolio.length > 0 && (
        <section id="work" className="scroll-mt-24 border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="CLIENT-GRADE WORK" title="Made with the workflow you'll learn" body="Every piece here was directed shot by shot — the image, the movement, the edit and the sound." />
            <WorkGallery items={portfolio.map((item) => ({ id: item.id, title: item.title, label: proofCategoryLabel(item.category), video: item.video, poster: proofPoster(item) }))} />
          </div>
        </section>
      )}

      {/* 5. AI Director Agent */}
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className={`grid gap-8 rounded-3xl border border-primary/25 bg-primary/[.04] p-7 sm:p-10 ${settings.studioDemoUrl ? "lg:grid-cols-2 lg:items-center" : ""}`}>
          <div>
            <p className="text-xs font-semibold tracking-[.2em] text-primary">YOUR AI DIRECTOR AGENT</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">An AI creative partner inside Creator Studio.</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">Tell your AI Director what you want to make. It helps develop your idea, write scripts, plan characters and storyboards, and generate images and videos across supported models. Keep your references and shots together, review the plan, and approve generation before it runs.</p>
            <div className={`mt-6 grid gap-3 ${settings.studioDemoUrl ? "" : "sm:grid-cols-3"}`}>
              {["Develop ideas and write scripts", "Plan characters, assets, and storyboards", "Generate images and videos with your API keys"].map((feature) => (
                <p key={feature} className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/80">{feature}</p>
              ))}
            </div>
            <Link href="/studio" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">Meet your AI Director <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {settings.studioDemoUrl && (
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-black">
              {demoIsVideo
                ? <video src={settings.studioDemoUrl} poster={settings.studioDemoPoster || undefined} controls muted playsInline preload="none" aria-label="Creator Studio in use" className="aspect-video w-full" />
                : <img src={settings.studioDemoUrl} alt="Creator Studio in use" loading="lazy" decoding="async" className="w-full" />}
            </div>
          )}
        </div>
      </section>

      {/* 6. Why creators choose AI Director Hub */}
      <section className="border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionTitle eyebrow={`${shownReasons.length} REASONS`} title="Why creators choose AI Director Hub" />
          <ol className="mt-12 space-y-14 lg:space-y-20">
            {shownReasons.map((reason, position) => (
              <li key={reason.key}>
                <div className="grid gap-6 lg:grid-cols-2 lg:items-center lg:gap-14">
                  <div className={position % 2 === 1 ? "lg:order-2" : ""}>
                    <p className="text-5xl font-semibold leading-none text-primary/80">{String(position + 1).padStart(2, "0")}</p>
                    <h3 className="mt-4 text-2xl font-semibold sm:text-3xl">{reason.title}</h3>
                    <p className="mt-3 max-w-xl text-base leading-relaxed text-white/60">{reason.body}</p>
                    {reason.key === "keys" && settings.costExample && <p className="mt-4 max-w-xl rounded-lg border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-white/80">{settings.costExample}</p>}
                  </div>
                  <div className={position % 2 === 1 ? "lg:order-1" : ""}>
                    {reason.key === "founder" && sales.length > 0
                      ? <FounderProof items={sales.slice(0, 3)} />
                      : reasonVisuals[reason.key]}
                  </div>
                </div>
                {(position === 2 || position === 6) && (
                  <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border border-white/10 bg-black/30 p-6">
                    <ProCta placement={`reasons-${position + 1}`} className="w-full sm:w-auto" />
                    <FreeCourseCta placement={`reasons-${position + 1}`} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 7. Courses */}
      {(freeCourse || proCourse) && (
        <section id="courses" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8">
          <SectionTitle eyebrow="COURSES" title="Start free. Go deeper with Pro." body="Practical training in AI filmmaking: shot design, character consistency, prompting, editing and the production workflow." />
          <div className="mt-9 grid gap-5 md:grid-cols-2">
            {freeCourse && <CourseCard course={freeCourse} />}
            {proCourse && <CourseCard course={proCourse} />}
          </div>
          <Link href="/courses" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">View all courses <ArrowRight className="h-4 w-4" /></Link>
        </section>
      )}

      {/* 8. Proof wall */}
      {(students.length > 0 || sales.length > 0) && (
        <section id="proof" className="scroll-mt-24 border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="PROOF" title="Results from students and clients" body="Shared with the permission of the people shown." />
            <ProofWall students={students.map(toWallItem)} sales={sales.map(toWallItem)} />
          </div>
        </section>
      )}

      {/* 9. Offer */}
      <section id="pricing" className="scroll-mt-24 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-[.22em] text-primary">AI DIRECTOR HUB PRO</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Start directing AI films today</h2>
          </div>
          <div className={`mx-auto mt-10 grid gap-5 ${settings.showAnnualPlan && settings.annualPrice ? "md:grid-cols-2" : "max-w-xl"}`}>
            <div className="rounded-3xl border border-primary/40 bg-primary/[.05] p-7 sm:p-9">
              <p className="text-sm font-semibold text-primary">Monthly</p>
              <p className="mt-3 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">₹799</span><span className="text-white/55">/month</span></p>
              <ul className="mt-7 space-y-3">
                {offerChecklist.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-white/80"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{line}</li>
                ))}
              </ul>
              <ProCta placement="pricing" className="mt-8 w-full" />
              <div className="mt-3 text-center"><FreeCourseCta placement="pricing" /></div>
            </div>
            {settings.showAnnualPlan && settings.annualPrice && (
              <div className="flex flex-col rounded-3xl border border-white/15 bg-white/[.03] p-7 sm:p-9">
                <p className="text-sm font-semibold text-primary">Annual</p>
                <p className="mt-3 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">₹{settings.annualPrice.toLocaleString("en-IN")}</span><span className="text-white/55">/year</span></p>
                <p className="mt-4 text-sm leading-relaxed text-white/60">Everything in Pro, billed once a year.</p>
                <ProCta placement="pricing-annual" className="mt-auto w-full border border-primary/50 bg-transparent text-primary hover:bg-primary/10">Choose annual <ArrowRight className="h-4 w-4" /></ProCta>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 10. FAQ */}
      <section id="faq" className="scroll-mt-24 border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionTitle eyebrow="FAQ" title="Questions before you start" />
          <div className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/30">
            {faqs.map((faq) => (
              <details key={faq.question} className="group px-5">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-white/65">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      </section>

      {/* 11. Final CTA */}
      <section className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8">
        <Quote className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-3xl font-semibold">Your next client won&apos;t pay for prompts.</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/55">They&apos;ll pay for creative judgment, reliable execution and work that helps them stand out. Start building that skill now.</p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <ProCta placement="final" className="w-full sm:w-auto" />
          <FreeCourseCta placement="final" />
        </div>
      </section>

      <Footer />
    </main>
  )
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <header>
      <p className="text-xs font-semibold tracking-[.22em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">{body}</p>}
    </header>
  )
}

function CourseCard({ course }: { course: CatalogCourse }) {
  const meta = courseMetaLine(course)
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
      <div className="relative aspect-video bg-[#0d0f0e]">
        {course.thumbnail && <img src={course.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${course.isFree ? "bg-primary text-black" : "bg-black/70 text-primary backdrop-blur-sm"}`}>{course.isFree ? "Free" : "Included in Pro"}</span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {meta && <p className="text-xs text-white/55">{meta}</p>}
        <h3 className="mt-2 text-xl font-semibold">{course.title}</h3>
        {course.description && <p className="mt-2 text-sm leading-relaxed text-white/55">{course.description}</p>}
        <div className="mt-auto pt-6">
          {course.isFree
            ? <FreeCourseCta placement="course-card" className="h-11 rounded-md bg-primary px-5 text-black no-underline hover:text-black hover:no-underline hover:brightness-110">Start free <ArrowRight className="h-4 w-4" /></FreeCourseCta>
            : <Link href={`/courses/${course.id}`} className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">See the course <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </div>
    </article>
  )
}

/** Reason 7's visual when there are published client sales to show for it. */
function FounderProof({ items }: { items: ProofItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const image = item.screenshots[0]?.thumb || proofPoster(item) || item.avatarImage
        const amount = formatProofAmount(item.amount, item.currency)
        return (
          <li key={item.id}>
            <a href="#proof" className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-primary/40">
              {image && <img src={image} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{item.title || item.personName}</span>
                {item.personRole && <span className="block truncate text-xs text-white/50">{item.personRole}</span>}
              </span>
              {amount && <span className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{amount}</span>}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
