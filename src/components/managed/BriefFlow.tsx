"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, Loader2, LogIn, Sparkles } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { AttachmentPicker, ChipPicker, Field, LinkList, TextArea, TextField } from "@/components/managed/BriefFields"
import { useManagedCheckout } from "@/components/managed/useManagedCheckout"
import { emptyManagedBrief, type ManagedBrief } from "@/lib/managed-brief"
import { MANAGED_ASPECT_RATIOS, MANAGED_CTAS, MANAGED_GOALS, MANAGED_PLATFORMS } from "@/lib/managed-production"
import { defaultPackageFor, serviceFromCatalogue, type OfferService } from "@/lib/managed-offers"
import { formatUsdWithInr } from "@/lib/currency"
import { fadeIn } from "@/lib/motion"

/**
 * The guided brief, one question set at a time.
 *
 * Seven short steps rather than one long form, because the whole of this page's
 * job is to make hiring a team feel less like filing paperwork. Nothing but the
 * package is required: a brief is a conversation starter, and refusing an order
 * because someone skipped "gender if relevant" loses the order — the project
 * chat exists to fill the gaps.
 *
 * Answers are held in one `ManagedBrief` and posted once, at checkout. There is
 * no draft on the server: a half-finished brief is not a thing anyone needs to
 * resume from another device, and storing one would mean unpaid rows nobody
 * can explain.
 */

const STEPS = ["Brand", "Goal", "Audience", "Creative", "Offer", "Videos", "Checkout"] as const

export default function BriefFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()

  const serviceKey = params.get("service") || ""
  const repeatFrom = params.get("repeat") || ""

  const [catalogue, setCatalogue] = useState<OfferService[] | null>(null)
  const [step, setStep] = useState(0)
  const [brief, setBrief] = useState<ManagedBrief>(() => emptyManagedBrief())
  const [packageKey, setPackageKey] = useState("")
  const [prefilled, setPrefilled] = useState("")

  const service = catalogue ? serviceFromCatalogue(catalogue, serviceKey) : null

  // The catalogue is editable, so the brief asks what this service currently
  // offers rather than shipping a copy of its packages and style options.
  useEffect(() => {
    let active = true
    fetch("/api/managed/offers")
      .then((response) => (response.ok ? response.json() : { services: [] }))
      .then((data) => { if (active) setCatalogue(data.services ?? []) })
      .catch(() => { if (active) setCatalogue([]) })
    return () => { active = false }
  }, [])

  // Pre-select the popular tier once the catalogue lands, but never overwrite a
  // choice already made — the fetch can finish after someone has picked. The
  // default is derived rather than stored, so there is no effect writing state
  // on the render that follows the catalogue arriving.
  const activePackageKey = packageKey || defaultPackageFor(service)?.key || ""

  const { submit, pending, error } = useManagedCheckout({
    onDone: (projectId) => router.push(`/hire-us/projects/${projectId}?welcome=1`),
  })

  const selected = useMemo(
    () => service?.packages.find((option) => option.key === activePackageKey) ?? null,
    [service, activePackageKey],
  )

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

  if (catalogue === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-32 text-center">
        <p className="text-white/50">That service is not available.</p>
        <Link href="/hire-us" className="mt-4 inline-block text-sm font-semibold text-primary">Back to services</Link>
      </div>
    )
  }

  const set = <K extends keyof ManagedBrief>(key: K, value: ManagedBrief[K]) =>
    setBrief((current) => ({ ...current, [key]: value }))

  const lastStep = STEPS.length - 1
  const canCheckout = Boolean(service.quoteOnly || selected)

  const handleSubmit = () => {
    if (!user) { signInWithGoogle(); return }
    submit({
      serviceType: service.key,
      packageKey: service.quoteOnly ? "" : activePackageKey,
      name: [brief.brandName, service.name].filter(Boolean).join(" — "),
      aspectRatio: brief.aspectRatio,
      brief,
    })
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pt-28 pb-24">
      <Link
        href="/hire-us"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All services
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{service.name}</h1>
      <p className="mt-2 text-white/50">{service.tagline}</p>

      {prefilled && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 text-xs text-primary/90">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Filled in from {prefilled}. Change anything that has moved on.
        </p>
      )}

      <ol className="mt-8 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                index === step
                  ? "bg-primary text-black"
                  : index < step
                    ? "bg-primary/15 text-primary"
                    : "bg-white/[0.06] text-white/35 hover:text-white/70"
              }`}
            >
              {index < step ? <Check className="mr-1 inline h-3 w-3" /> : null}
              {label}
            </button>
            {index < lastStep && <span className="h-px w-3 bg-white/10" />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} {...fadeIn} className="glass-card mt-6 space-y-5 rounded-2xl border-white/10 p-6">
          {step === 0 && (
            <>
              <StepHeading title="Tell us about your brand" body="So the script sounds like you, not like an ad template." />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Brand name"><TextField value={brief.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Acme" /></Field>
                <Field label="Website" optional><TextField value={brief.brandWebsite} onChange={(e) => set("brandWebsite", e.target.value)} placeholder="https://" /></Field>
                <Field label="Product or service"><TextField value={brief.productName} onChange={(e) => set("productName", e.target.value)} /></Field>
                <Field label="Product URL" optional><TextField value={brief.productUrl} onChange={(e) => set("productUrl", e.target.value)} placeholder="https://" /></Field>
                <Field label="Industry / category" optional><TextField value={brief.industry} onChange={(e) => set("industry", e.target.value)} /></Field>
              </div>
              <Field label="Short description of the product" hint="What it is and what it does, in a couple of sentences.">
                <TextArea value={brief.productDescription} onChange={(e) => set("productDescription", e.target.value)} />
              </Field>
              <div className="space-y-3 border-t border-white/[0.06] pt-5">
                <AttachmentPicker kind="logo" label="Upload logo" accept="image/*" value={brief.attachments} onChange={(next) => set("attachments", next)} multiple={false} />
                <AttachmentPicker kind="product_image" label="Upload product images" accept="image/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                <AttachmentPicker kind="product_video" label="Upload product videos" accept="video/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
                <AttachmentPicker kind="brand_guideline" label="Upload brand guidelines" accept="application/pdf,image/*,.doc,.docx" value={brief.attachments} onChange={(next) => set("attachments", next)} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <StepHeading title="What do you want this video to achieve?" />
              <ChipPicker options={MANAGED_GOALS} value={brief.goal ? [brief.goal] : []} onChange={(next) => set("goal", next[0] || "")} />
              <Field label="Anything else about the goal" optional>
                <TextArea value={brief.goalNotes} onChange={(e) => set("goalNotes", e.target.value)} placeholder="Targets, timing, the campaign this belongs to…" />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <StepHeading title="Who is this for?" body="The more specific, the sharper the hook." />
              <Field label="Who is the target customer?">
                <TextArea value={brief.audience} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. first-time mothers in tier-2 cities who shop on Instagram" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Country / market" optional><TextField value={brief.market} onChange={(e) => set("market", e.target.value)} /></Field>
                <Field label="Age range" optional><TextField value={brief.ageRange} onChange={(e) => set("ageRange", e.target.value)} placeholder="25–40" /></Field>
                <Field label="Gender" optional><TextField value={brief.gender} onChange={(e) => set("gender", e.target.value)} placeholder="If it matters" /></Field>
              </div>
              <Field label="Main problem or pain point" optional>
                <TextArea value={brief.painPoint} onChange={(e) => set("painPoint", e.target.value)} />
              </Field>
              <Field label="Why would they buy this?" optional>
                <TextArea value={brief.whyBuy} onChange={(e) => set("whyBuy", e.target.value)} />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <StepHeading title="What style of video do you want?" body="Pick as many as feel right — we will recommend one." />
              <ChipPicker options={service.styles} value={brief.styles} onChange={(next) => set("styles", next)} multiple />
              <Field label="Reference ads, competitor ads, or links" optional hint="One per line.">
                <LinkList value={brief.referenceLinks} onChange={(next) => set("referenceLinks", next)} placeholder={"https://…\nhttps://…"} />
              </Field>
              <AttachmentPicker kind="reference" label="Upload references" accept="image/*,video/*" value={brief.attachments} onChange={(next) => set("attachments", next)} />
              <Field label="Anything you definitely want included?" optional>
                <TextArea value={brief.mustInclude} onChange={(e) => set("mustInclude", e.target.value)} />
              </Field>
              <Field label="Anything we should avoid?" optional>
                <TextArea value={brief.mustAvoid} onChange={(e) => set("mustAvoid", e.target.value)} />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <StepHeading title="The offer and the call to action" />
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Product price" optional><TextField value={brief.price} onChange={(e) => set("price", e.target.value)} placeholder="₹1,499" /></Field>
                <Field label="Discount" optional><TextField value={brief.discount} onChange={(e) => set("discount", e.target.value)} placeholder="20% off" /></Field>
                <Field label="Landing page URL" optional><TextField value={brief.landingPageUrl} onChange={(e) => set("landingPageUrl", e.target.value)} placeholder="https://" /></Field>
              </div>
              <Field label="Current offer" optional>
                <TextArea value={brief.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Buy 2 get 1 free until the end of the month…" />
              </Field>
              <Field label="Main call to action">
                <ChipPicker options={MANAGED_CTAS} value={brief.cta ? [brief.cta] : []} onChange={(next) => set("cta", next[0] || "")} />
              </Field>
            </>
          )}

          {step === 5 && (
            <>
              <StepHeading title="How should it be delivered?" />
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
              <Field label="Where will these run?">
                <ChipPicker options={MANAGED_PLATFORMS} value={brief.platforms} onChange={(next) => set("platforms", next)} multiple />
              </Field>
              <Field label="Want other versions as well?" optional hint="Extra ratios or cutdowns. We will price them with you in the project chat.">
                <TextArea value={brief.extraVersions} onChange={(e) => set("extraVersions", e.target.value)} />
              </Field>
              <Field label="Anything else we should know?" optional>
                <TextArea value={brief.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </>
          )}

          {step === 6 && (
            <>
              <StepHeading
                title={service.quoteOnly ? "Request a proposal" : "Your order"}
                body={
                  service.quoteOnly
                    ? "Micro-drama is scoped with you before it is priced — episode count, cast and how the product lives in the plot."
                    : undefined
                }
              />

              {!service.quoteOnly && (
                <div className="space-y-2">
                  {service.packages.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setPackageKey(option.key)}
                      className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition duration-press ease-out active:scale-[0.99] ${
                        activePackageKey === option.key
                          ? "border-primary bg-primary/10"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{option.name}</span>
                          {option.popular && (
                            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">Most picked</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-white/45">{option.summary}</span>
                        <span className="mt-2 block space-y-1">
                          {option.includes.map((line) => (
                            <span key={line} className="flex items-start gap-1.5 text-[11px] text-white/40">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
                              {line}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-bold text-white">{formatUsdWithInr(option.priceInr)}</span>
                    </button>
                  ))}
                </div>
              )}

              {selected && (
                <dl className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                  <SummaryRow label="Package" value={`${service.name} — ${selected.name}`} />
                  <SummaryRow label="Videos" value={selected.summary} />
                  <SummaryRow label="Revisions" value={`${selected.revisions} per video`} />
                  <SummaryRow label="Delivery" value={brief.aspectRatio} />
                  <SummaryRow label="Included" value="Script + production + editing" />
                  <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.08] pt-3">
                    <dt className="text-sm font-bold text-white">Total</dt>
                    <dd className="text-lg font-bold text-primary">{formatUsdWithInr(selected.priceInr)}</dd>
                  </div>
                </dl>
              )}

              {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

              {!authLoading && !user ? (
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-black transition duration-press ease-out hover:brightness-110 active:scale-[0.98]"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in to continue
                </button>
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
              <p className="text-center text-[11px] text-white/30">
                Charged in rupees by Razorpay. See our{" "}
                <Link href="/refund" className="underline hover:text-white/60">refund policy</Link>.
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="flex h-11 items-center gap-2 rounded-md border border-white/12 px-4 text-sm font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {step < lastStep && (
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(lastStep, current + 1))}
            className="flex h-11 items-center gap-2 rounded-md bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-[0.97]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  )
}

function StepHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {body && <p className="mt-1 text-sm text-white/45">{body}</p>}
    </div>
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
