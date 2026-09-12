"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Building2, Loader2, RefreshCcw, RotateCcw } from "lucide-react"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import StatusTimeline from "@/components/managed/StatusTimeline"
import ProjectChat from "@/components/managed/ProjectChat"
import Deliverables, { FinalDelivery } from "@/components/managed/Deliverables"
import ReviewSheet from "@/components/managed/ReviewSheet"
import type { ManagedDeliverable, ManagedProjectPayload } from "@/components/managed/types"
import { MANAGED_STATUS_LABELS, serviceName } from "@/lib/managed-production"
import { formatUsdWithInr } from "@/lib/currency"

/**
 * One managed project, as the client sees it.
 *
 * Everything about the engagement in one place: where production has got to,
 * the videos, the conversation, the finals. Nothing about how the work is made
 * — no Studio, no Director, no storyboard — because a client who hired a team
 * did so to not operate one.
 *
 * Admins open the same page, which is deliberate: the producer should be
 * reading exactly what the client reads. Their own controls live in Admin →
 * Managed, so this page never grows two modes.
 */
export default function ManagedProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [data, setData] = useState<ManagedProjectPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState<ManagedDeliverable | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/managed/projects/${projectId}`)
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Could not load this project.")
      setData(payload)
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this project.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!user) { setLoading(authLoading); return }
    load()
    // Same cadence as the notification bell: a message or a new cut lands
    // within half a minute without a second realtime connection to keep alive.
    const interval = window.setInterval(load, 30_000)
    return () => window.clearInterval(interval)
  }, [user, authLoading, load])

  if (!authLoading && !user) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-md px-6 pt-40 text-center">
          <h1 className="text-xl font-bold">Sign in to open your project</h1>
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="mt-5 h-11 w-full rounded-md bg-primary text-sm font-semibold text-black transition hover:brightness-110"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    )
  }

  if (loading || !data) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          {error ? (
            <p className="max-w-md rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
        </div>
      </main>
    )
  }

  const { project, deliverables, versions, messages, comments, viewer } = data
  const awaitingReview = deliverables.filter((deliverable) => deliverable.status === "ready_for_review").length

  return (
    <main className="min-h-screen pb-20">
      <Navbar />

      <div className="mx-auto max-w-6xl px-5 pt-28 sm:px-6">
        <Link
          href="/hire-us/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All projects
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Building2 className="h-3.5 w-3.5" />
              {project.brief.brandName || "Your brand"}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{project.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/40">
              <span>{serviceName(project.service_type)}</span>
              <span aria-hidden>·</span>
              <span>{project.video_count} × {project.duration_seconds}s</span>
              <span aria-hidden>·</span>
              <span>{project.aspect_ratio}</span>
              <span aria-hidden>·</span>
              <span>Ordered {new Date(project.created_at).toLocaleDateString()}</span>
              {project.price_inr > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatUsdWithInr(project.price_inr)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {awaitingReview > 0 && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
                {awaitingReview} awaiting your review
              </span>
            )}
            <button
              type="button"
              onClick={load}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/12 text-white/50 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Refresh"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {project.payment_status === "proposal_requested" ? (
          <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/[0.06] p-5">
            <p className="text-sm font-bold text-white">Proposal requested</p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              We have your brief for a branded micro-drama. The team will come back in the chat below with
              episode count, scope and a price before anything is charged.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <StatusTimeline status={project.status} />
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <FinalDelivery deliverables={deliverables} versions={versions} />

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">Deliverables</h2>
                <p className="text-[11px] text-white/35">
                  {deliverables.filter((deliverable) => deliverable.status === "approved").length} of {deliverables.length} approved
                </p>
              </div>
              <Deliverables
                deliverables={deliverables}
                versions={versions}
                revisionsIncluded={project.revisions_included}
                onOpen={setReviewing}
              />
            </section>

            <BriefSummary project={project} />

            {/* The repeat order. A recurring brand's second campaign should not
                mean re-typing their brand, product and audience — those carry
                over, and only the things a new campaign is actually about are
                asked again. */}
            {project.status === "completed" && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                <h2 className="text-sm font-bold">Ready for the next one?</h2>
                <p className="mt-1 text-xs text-white/45">
                  We will carry over your brand, product, audience and platforms. You choose the new offer,
                  goal and creative direction.
                </p>
                <Link
                  href={`/hire-us/brief?service=${project.service_type}&repeat=${project.id}`}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.97]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Create another campaign
                </Link>
              </section>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <ProjectChat
              projectId={project.id}
              messages={messages}
              deliverables={deliverables}
              viewerId={viewer.id}
              onSent={load}
            />
          </div>
        </div>
      </div>

      {reviewing && (
        <ReviewSheet
          deliverable={reviewing}
          versions={versions.filter((version) => version.deliverable_id === reviewing.id)}
          comments={comments.filter((comment) => comment.deliverable_id === reviewing.id)}
          canAct={viewer.isOwner && reviewing.status !== "approved"}
          onClose={() => setReviewing(null)}
          onSubmitted={load}
        />
      )}
    </main>
  )
}

/** What we were told, kept visible so a client can check we got it right. */
function BriefSummary({ project }: { project: ManagedProjectPayload["project"] }) {
  const { brief } = project
  const rows: Array<[string, string]> = [
    ["Goal", [brief.goal, brief.goalNotes].filter(Boolean).join(" — ")],
    ["Audience", brief.audience],
    ["Market", [brief.market, brief.ageRange, brief.gender].filter(Boolean).join(", ")],
    ["Pain point", brief.painPoint],
    ["Creative direction", brief.styles.join(", ")],
    ["Must include", brief.mustInclude],
    ["Avoid", brief.mustAvoid],
    ["Offer", [brief.offer, brief.price, brief.discount].filter(Boolean).join(" · ")],
    ["Call to action", brief.cta],
    ["Landing page", brief.landingPageUrl],
    ["Platforms", brief.platforms.join(", ")],
    ["Notes", brief.notes],
  ].filter(([, value]) => Boolean(value?.trim())) as Array<[string, string]>

  if (!rows.length) return null

  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <summary className="cursor-pointer text-sm font-bold">
        Your brief
        <span className="ml-2 text-xs font-normal text-white/35">
          — {MANAGED_STATUS_LABELS[project.status] || "in progress"}
        </span>
      </summary>
      <dl className="mt-4 space-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
            <dt className="text-xs font-semibold text-white/35">{label}</dt>
            <dd className="whitespace-pre-wrap text-xs leading-relaxed text-white/65">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
