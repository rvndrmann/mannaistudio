"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Check, ChevronDown, Loader2, LogIn, Lock, Sparkles } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { getVisitorId } from "@/lib/analytics"
import { AttachmentPicker, ChipPicker, Field, LinkList, TextArea, TextField } from "@/components/managed/BriefFields"
import { useManagedCheckout } from "@/components/managed/useManagedCheckout"
import { emptyManagedBrief, managedBriefSchema, type ManagedBrief } from "@/lib/managed-brief"
import { MANAGED_ASPECT_RATIOS, MANAGED_CTAS, MANAGED_GOALS, MANAGED_PLATFORMS } from "@/lib/managed-production"
import { cheapestPackage, defaultPackageFor, publishedOffers, serviceFromCatalogue, type OfferService } from "@/lib/managed-offers"
import { formatUsdWithInr } from "@/lib/currency"
import { fadeIn } from "@/lib/motion"

/**
 * The brief, on one page.
 *
 * It used to be seven steps. Seven steps is six chances to close the tab, and
 * the six screens before the price were answering questions the team can ask in
 * the project chat — so the order they gate is an order nobody placed. What a
 * production actually cannot start without is the gig, the product, something
 * to look at, and the money: everything else is a conversation.
 *
 * So this page asks for that much in one scroll — pick what we are making, tell
 * us what it is for, hand over the images, the videos and the links, sign in
 * and pay — and folds the rest of the old flow into one optional block for the
 * clients who want to spell it all out. Nothing was deleted from the brief;
 * what changed is that answering all of it is no longer the price of ordering.
 *
 * The gig is chosen here rather than assumed. Arriving without one used to dead
 * end on "That service is not available"; now the catalogue is the first thing
 * on the page, which is also the honest order — you cannot price a package for
 * a service nobody picked.
 */

/** Named for the admin's abandoned-brief bar, which reads progress out of these. */
const SECTIONS = ["Service", "Product", "Media", "Delivery", "Checkout"] as const

/** Survives the OAuth round-trip, which leaves and re-enters this page. */
const DRAFT_KEY = "adh:brief-draft"

type StashedBrief = { serviceKey: string; packageKey: string; brief: unknown }

function stashBrief(payload: StashedBrief) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  } catch {
    // A brief that cannot be stashed is still a brief that can be typed again.
  }
}

function readStashedBrief(serviceKey: string): { brief: ManagedBrief; packageKey: string } | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StashedBrief
    if (parsed.serviceKey !== serviceKey) return null
    const brief = managedBriefSchema.safeParse(parsed.brief)
    return brief.success ? { brief: brief.data, packageKey: parsed.packageKey || "" } : null
  } catch {
    return null
  }
}

function clearStashedBrief() {
  try { window.sessionStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }
}

export default function BriefOnePage() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()

  const repeatFrom = params.get("repeat") || ""

  const initialServiceKey = params.get("service") || ""

  /**
   * The brief as it was when we sent them to Google.
   *
   * Signing in is a full page navigation away and back, and the pay button now
   * sits on the same screen as the form — so without this, the most common path
   * through the page (fill it in, press pay, sign in) would return the visitor
   * to an empty form. Read at mount rather than in an effect: it is the state
   * this page opens with, not a change to react to.
   */
  const [restored] = useState(() => readStashedBrief(initialServiceKey))

  const [catalogue, setCatalogue] = useState<OfferService[] | null>(null)
  // The gig lives in state, not only in the URL: picking one on this page must
  // not reload the route and throw away everything typed above it.
  const [serviceKey, setServiceKey] = useState(initialServiceKey)
  const [brief, setBrief] = useState<ManagedBrief>(() => restored?.brief ?? emptyManagedBrief())
  // The homepage plan cards deep-link a tier as well as a gig, so arriving from
  // "Start Growth" opens on Growth rather than on whatever is marked popular.
  const [packageKey, setPackageKey] = useState(restored?.packageKey || params.get("package") || "")
  const [prefilled, setPrefilled] = useState("")
  const [detailOpen, setDetailOpen] = useState(false)
  // Nothing is written until the visitor has typed or moved. Opening the page —
  // or having last year's brief filled in for you — is not a lead, and a list
  // of everyone who ever glanced at the form is a list nobody reads.
  const [touched, setTouched] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  const service = catalogue ? serviceFromCatalogue(catalogue, serviceKey) : null

  // The catalogue is editable, so the brief asks what is currently on sale
  // rather than shipping a copy of the gigs and their packages — and only what
  // is published, because this is the page that takes the money and checkout
  // refuses to price a draft. A `?service=` naming one falls through to the
  // picker, which is the right answer: it is not for sale.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setCatalogue(publishedOffers(data.services ?? [])) })
      .catch(() => { if (active) setCatalogue([]) })
    return () => { active = false }
  }, [])

  // Pre-select the popular tier, but never overwrite a choice already made —
  // the fetch can finish after someone has picked. Derived rather than stored,
  // so no effect writes state on the render after the catalogue arrives.
  const activePackageKey = packageKey || defaultPackageFor(service)?.key || ""

  const { submit, pending, error } = useManagedCheckout({
    onDone: (projectId) => {
      clearStashedBrief()
      // Same browser, same service: the draft this order came from stops
      // counting as abandoned. The admin list infers it from the order anyway
      // if this request never lands, so a closed tab cannot leave a paying
      // client sitting in a follow-up queue.
      void fetch("/api/managed/brief-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ type: "converted", visitorId: getVisitorId(), serviceKey, projectId }),
      }).catch(() => undefined)
      router.push(`/hire-us/projects/${projectId}?welcome=1`)
    },
  })

  const selected = useMemo(
    () => service?.packages.find((option) => option.key === activePackageKey) ?? null,
    [service, activePackageKey],
  )

  // Spent, now that it is in state. The prefill below only fills blanks, so
  // what they typed before signing in still outranks what we know about them.
  useEffect(() => {
    if (restored) clearStashedBrief()
  }, [restored])

  // What we already know about this client. Only fills blanks, so a brief
  // someone has started typing into is never overwritten by their history.
  useEffect(() => {
    if (!user) return
    let active = true
    fetch(`/api/managed/prefill${repeatFrom ? `?from=${repeatFrom}` : ""}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.brief) return
        setBrief((current) => {
          const merged = { ...current }
          for (const [key, value] of Object.entries(data.brief) as Array<[keyof ManagedBrief, unknown]>) {
            const existing = merged[key]
            const isBlank = Array.isArray(existing) ? existing.length === 0 : !existing
            const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value)
            if (isBlank && hasValue) (merged as Record<string, unknown>)[key] = value
          }
          return merged
        })
        setPrefilled(data.sourceName || "")
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [user, repeatFrom])

  /**
   * How far through the form they got, for the abandoned-brief list.
   *
   * There are no steps to report any more, so progress is measured by what has
   * actually been answered. Same scale as before — a number out of a total —
   * which is all the admin's progress bar ever read.
   */
  const reached = useMemo(() => {
    const done = [
      Boolean(serviceKey),
      Boolean(brief.brandName || brief.productName || brief.productDescription),
      brief.attachments.length > 0 || brief.referenceLinks.length > 0 || Boolean(brief.brandWebsite || brief.productUrl),
      brief.platforms.length > 0,
    ].filter(Boolean).length
    return Math.min(done, SECTIONS.length - 1)
  }, [serviceKey, brief])

  /**
   * The brief, saved while it is still being written.
   *
   * Someone who describes their product in detail and then closes the tab at
   * the price used to leave nothing behind at all. This writes a draft a second
   * and a half after the last keystroke — one row per browser per service,
   * updated in place — so an abandoned brief is something the team can follow
   * up rather than something that never happened.
   */
  useEffect(() => {
    if (!touched || !service) return
    const timer = window.setTimeout(() => {
      void fetch("/api/managed/brief-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Survives the navigation that interrupts it — closing the tab is the
        // most likely way this brief ends, and that is the save that matters.
        keepalive: true,
        body: JSON.stringify({
          type: "save",
          visitorId: getVisitorId(),
          serviceKey: service.key,
          packageKey: activePackageKey,
          brief,
          furthestStep: reached,
          totalSteps: SECTIONS.length,
        }),
      }).catch(() => undefined)
    }, 1_500)
    return () => window.clearTimeout(timer)
  }, [touched, service, activePackageKey, brief, reached])

  const set = <K extends keyof ManagedBrief>(key: K, value: ManagedBrief[K]) => {
    setTouched(true)
    setBrief((current) => ({ ...current, [key]: value }))
  }

  const chooseService = (next: OfferService) => {
    setTouched(true)
    setServiceKey(next.key)
    setPackageKey("")
    // Keeps the URL shareable and the back button honest without remounting the
    // route, which would take the half-typed brief with it.
    window.history.replaceState(null, "", `/hire-us/brief?service=${next.key}`)
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  // A gig or tier left unpublished is a draft that only its admin can see, and
  // checkout refuses to price one. Better to say so under the packages than to
  // let someone press Pay and meet "That service is not available" from the
  // gateway — which is exactly what the old flow did.
  const draft = Boolean(service && !service.isPublished) || Boolean(selected && !selected.isPublished)
  const canCheckout = Boolean(service && (service.quoteOnly || selected)) && !draft

  const handleSubmit = () => {
    if (!service) return
    if (!user) {
      stashBrief({ serviceKey: service.key, packageKey: activePackageKey, brief })
      signInWithGoogle()
      return
    }
    submit({
      serviceType: service.key,
      packageKey: service.quoteOnly ? "" : activePackageKey,
      name: [brief.brandName, service.name].filter(Boolean).join(" — "),
      aspectRatio: brief.aspectRatio,
      brief,
    })
  }

  if (catalogue === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!catalogue.length) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-32 text-center">
        <p className="text-white/50">We are not taking new projects right now.</p>
        <Link href="/hire-us" className="mt-4 inline-block text-sm font-semibold text-primary">Back to services</Link>
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-5 pt-28 pb-24 sm:px-6">
      <Link
        href="/hire-us"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All services
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
        {service ? service.name : "Start your project"}
      </h1>
      <p className="mt-2 text-white/50">
        {service
          ? service.tagline || "One page. Tell us what to make, upload what you have, and pay."
          : "Pick what you want made, then fill in one short form. No back and forth before you can order."}
      </p>

      {prefilled && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 text-xs text-primary/90">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Filled in from {prefilled}. Change anything that has moved on.
        </p>
      )}

      {/* minmax(0,…) rather than the implicit `auto` track at both widths: an
          auto track refuses to shrink below its content's minimum, and the form
          is full of things with no small minimum — a pasted URL, a long brand
          name, a nowrap price. Left as `auto`, one of them widens the column and
          the whole page scrolls sideways on a phone. */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          {/* 1 — The gig. Nothing below it can be priced until this is answered. */}
          <Block title="What do you want made?" step={1}>
            <div className="grid gap-3 sm:grid-cols-2">
              {catalogue.map((option) => (
                <ServiceOption
                  key={option.key}
                  service={option}
                  active={option.key === serviceKey}
                  onPick={() => chooseService(option)}
                />
              ))}
            </div>
          </Block>

          <AnimatePresence mode="wait">
            {service && (
              <motion.div key={service.key} {...fadeIn} ref={formRef} className="scroll-mt-24 space-y-6">
                {/* 2 — The product. Four things a script cannot be written without. */}
                <Block title="Your product" step={2}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Brand name">
                      <TextField value={brief.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Acme" />
                    </Field>
                    <Field label="Product or service">
                      <TextField value={brief.productName} onChange={(e) => set("productName", e.target.value)} />
                    </Field>
                    <Field label="Website" optional>
                      <TextField value={brief.brandWebsite} onChange={(e) => set("brandWebsite", e.target.value)} placeholder="https://" />
                    </Field>
                    <Field label="Product or landing page link" optional>
                      <TextField value={brief.productUrl} onChange={(e) => set("productUrl", e.target.value)} placeholder="https://" />
                    </Field>
                  </div>
                  <Field label="What is it, and who is it for?" hint="A couple of sentences is plenty — we will ask the rest in your project chat.">
                    <TextArea value={brief.productDescription} onChange={(e) => set("productDescription", e.target.value)} />
                  </Field>
                </Block>

                {/* 3 — The media. The single most useful thing a client can hand over. */}
                <Block
                  title="Your product and references"
                  step={3}
                  body="Product shots, clips you already have, and any ad you want this to feel like."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AttachmentPicker kind="product_image" label="Product images" accept="image/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                    <AttachmentPicker kind="product_video" label="Product videos" accept="video/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                    <AttachmentPicker kind="reference" label="Reference images & videos" accept="image/*,video/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                    <AttachmentPicker kind="logo" label="Logo" accept="image/*" value={brief.attachments} onChange={(next) => set("attachments", next)} multiple={false} />
                  </div>
                  <Field label="Reference links" optional hint="Competitor ads, a video you like, a Drive folder — one per line.">
                    <LinkList value={brief.referenceLinks} onChange={(next) => set("referenceLinks", next)} placeholder={"https://…\nhttps://…"} />
                  </Field>
                </Block>

                {/* 4 — Delivery. Two answers, because they decide how it is shot. */}
                <Block title="How it should be delivered" step={4}>
                  <Field label="Aspect ratio">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {MANAGED_ASPECT_RATIOS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => set("aspectRatio", option.value)}
                          className={`rounded-xl border px-4 py-3 text-left transition duration-press ease-out active:scale-[0.98] ${
                            brief.aspectRatio === option.value
                              ? "border-primary bg-primary/10"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-white">{option.label}</span>
                          <span className="block text-[11px] text-white/40">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Where will these run?" optional>
                    <ChipPicker options={MANAGED_PLATFORMS} value={brief.platforms} onChange={(next) => set("platforms", next)} multiple />
                  </Field>
                </Block>

                {/* 5 — Everything the seven steps used to demand, now optional. */}
                <div className="glass-card overflow-hidden rounded-2xl border-white/10">
                  <button
                    type="button"
                    onClick={() => setDetailOpen(!detailOpen)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition hover:bg-white/[0.03]"
                  >
                    <span>
                      <span className="block text-base font-bold tracking-tight">Add more detail</span>
                      <span className="mt-0.5 block text-xs text-white/40">
                        Goal, audience, offer, creative direction. Optional — we can cover it in your project chat.
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition ${detailOpen ? "rotate-180" : ""}`} />
                  </button>

                  {detailOpen && (
                    <div className="space-y-5 border-t border-white/[0.08] px-6 py-6">
                      <Field label="What should this video achieve?" optional>
                        <ChipPicker options={MANAGED_GOALS} value={brief.goal ? [brief.goal] : []} onChange={(next) => set("goal", next[0] || "")} />
                      </Field>
                      <Field label="Who is the target customer?" optional>
                        <TextArea value={brief.audience} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. first-time mothers in tier-2 cities who shop on Instagram" />
                      </Field>
                      <div className="grid gap-5 sm:grid-cols-3">
                        <Field label="Country / market" optional><TextField value={brief.market} onChange={(e) => set("market", e.target.value)} /></Field>
                        <Field label="Age range" optional><TextField value={brief.ageRange} onChange={(e) => set("ageRange", e.target.value)} placeholder="25–40" /></Field>
                        <Field label="Gender" optional><TextField value={brief.gender} onChange={(e) => set("gender", e.target.value)} placeholder="If it matters" /></Field>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Main problem it solves" optional><TextArea value={brief.painPoint} onChange={(e) => set("painPoint", e.target.value)} /></Field>
                        <Field label="Why would they buy it?" optional><TextArea value={brief.whyBuy} onChange={(e) => set("whyBuy", e.target.value)} /></Field>
                      </div>

                      {service.styles.length > 0 && (
                        <Field label="Style" optional hint="Pick as many as feel right — we will recommend one.">
                          <ChipPicker options={service.styles} value={brief.styles} onChange={(next) => set("styles", next)} multiple />
                        </Field>
                      )}
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Must include" optional><TextArea value={brief.mustInclude} onChange={(e) => set("mustInclude", e.target.value)} /></Field>
                        <Field label="Must avoid" optional><TextArea value={brief.mustAvoid} onChange={(e) => set("mustAvoid", e.target.value)} /></Field>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-3">
                        <Field label="Product price" optional><TextField value={brief.price} onChange={(e) => set("price", e.target.value)} placeholder="₹1,499" /></Field>
                        <Field label="Discount" optional><TextField value={brief.discount} onChange={(e) => set("discount", e.target.value)} placeholder="20% off" /></Field>
                        <Field label="Landing page URL" optional><TextField value={brief.landingPageUrl} onChange={(e) => set("landingPageUrl", e.target.value)} placeholder="https://" /></Field>
                      </div>
                      <Field label="Current offer" optional>
                        <TextArea value={brief.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Buy 2 get 1 free until the end of the month…" />
                      </Field>
                      <Field label="Main call to action" optional>
                        <ChipPicker options={MANAGED_CTAS} value={brief.cta ? [brief.cta] : []} onChange={(next) => set("cta", next[0] || "")} />
                      </Field>

                      <Field label="Other versions you want" optional hint="Extra ratios or cutdowns. We will price them with you in the project chat.">
                        <TextArea value={brief.extraVersions} onChange={(e) => set("extraVersions", e.target.value)} />
                      </Field>
                      <Field label="Brand guidelines" optional>
                        <AttachmentPicker kind="brand_guideline" label="Upload brand guidelines" accept="application/pdf,image/*,.doc,.docx" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                      </Field>
                      <Field label="Anything else we should know?" optional>
                        <TextArea value={brief.notes} onChange={(e) => set("notes", e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The price, the login and the pay button, visible the whole way down —
            the point of collapsing the flow is that checkout is never a screen
            you have to reach. */}
        <aside className="lg:sticky lg:top-24">
          <div className="glass-card space-y-4 rounded-2xl border-white/10 p-6">
            {!service ? (
              <>
                <h2 className="text-base font-bold tracking-tight">Your order</h2>
                <p className="text-sm text-white/45">Choose a service to see the packages and the price.</p>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold tracking-tight">
                  {service.quoteOnly ? "Request a proposal" : "Your order"}
                </h2>

                {service.quoteOnly ? (
                  <p className="text-sm text-white/45">
                    This one is scoped with you before it is priced. Send the brief and we will come back with a quote.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {service.packages.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => { setTouched(true); setPackageKey(option.key) }}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition duration-press ease-out active:scale-[0.99] ${
                          activePackageKey === option.key
                            ? "border-primary bg-primary/10"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-white">{option.name}</span>
                            {option.popular && (
                              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">Most picked</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-white/45">{option.summary}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs font-bold text-white">{formatUsdWithInr(option.priceInr)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selected && (
                  <dl className="space-y-1.5 border-t border-white/[0.08] pt-4 text-sm">
                    <SummaryRow label="Videos" value={selected.summary || `${selected.videoCount}`} />
                    <SummaryRow label="Revisions" value={`${selected.revisions} per video`} />
                    <SummaryRow label="Delivery" value={brief.aspectRatio} />
                    <SummaryRow label="Included" value="Script + production + editing" />
                    <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.08] pt-3">
                      <dt className="text-sm font-bold text-white">Total</dt>
                      <dd className="text-lg font-bold text-primary">{formatUsdWithInr(selected.priceInr)}</dd>
                    </div>
                  </dl>
                )}

                {draft && (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] font-semibold text-amber-200">
                    Draft — only you can see this, and it cannot be paid for yet. Publish{" "}
                    {service.isPublished ? "this package" : "the service and its packages"} in Admin →
                    Managed Production → Offers.
                  </p>
                )}

                {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

                {!authLoading && !user ? (
                  <>
                    <button
                      type="button"
                      disabled={!canCheckout}
                      onClick={handleSubmit}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    >
                      <LogIn className="h-4 w-4" />
                      {service.quoteOnly ? "Sign in to send it" : "Sign in & pay"}
                    </button>
                    <p className="text-center text-[11px] text-white/35">
                      Your answers are kept while you sign in.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending || !canCheckout}
                    onClick={handleSubmit}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {service.quoteOnly
                      ? "Send my brief"
                      : selected
                        ? `Pay ${formatUsdWithInr(selected.priceInr)}`
                        : "Choose a package"}
                  </button>
                )}

                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/30">
                  <Lock className="h-3 w-3" />
                  Charged in rupees by Razorpay.{" "}
                  <Link href="/refund" className="underline hover:text-white/60">Refund policy</Link>.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

/** One numbered section of the single page. */
function Block({ title, step, body, children }: {
  title: string
  step: number
  body?: string
  children: React.ReactNode
}) {
  return (
    <div className="glass-card space-y-5 rounded-2xl border-white/10 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
          {step}
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          {body && <p className="mt-1 text-sm text-white/45">{body}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

/** A gig, as something to choose rather than something to read about. */
function ServiceOption({ service, active, onPick }: {
  service: OfferService
  active: boolean
  onPick: () => void
}) {
  const cheapest = cheapestPackage(service)
  const poster = service.thumbnailUrl || ""

  return (
    <button
      type="button"
      onClick={onPick}
      // min-w-0 because this is a grid item, and a grid item's automatic minimum
      // size is its content's — which here is a line of `truncate` text that,
      // being nowrap, measures its full untruncated length. Without this the
      // card refuses to narrow and takes the page's width with it.
      className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition duration-press ease-out active:scale-[0.99] ${
        active ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
        {poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : service.videoUrl ? (
          <video src={`${service.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        ) : (
          <Sparkles className="h-5 w-5 text-white/25" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-white">{service.name}</span>
          {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </span>
        {service.tagline && <span className="mt-0.5 block truncate text-xs text-white/45">{service.tagline}</span>}
        <span className="mt-1 block text-[11px] font-semibold text-white/55">
          {!service.isPublished ? (
            <span className="text-amber-300">Draft — not on sale</span>
          ) : service.quoteOnly ? (
            "Quoted for you"
          ) : cheapest ? (
            `From ${formatUsdWithInr(cheapest.priceInr)}`
          ) : ""}
        </span>
      </span>
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="text-right text-xs font-medium text-white/75">{value}</dd>
    </div>
  )
}
