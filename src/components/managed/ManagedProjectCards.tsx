"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Loader2, MessageSquare, Plus } from "lucide-react"
import { MANAGED_STATUS_LABELS, serviceName } from "@/lib/managed-production"

/**
 * The client's managed projects, as cards.
 *
 * Shared by /account and /hire-us/projects so a client meets the same block in
 * both places rather than two different-looking lists of the same work. The
 * "Action Required" badge is the point of the card: with several campaigns
 * running, what matters is which one is waiting on them.
 */

export type ManagedProjectCard = {
  id: string
  name: string
  service_type: string
  status: string
  payment_status: string
  video_count: number
  aspect_ratio: string
  created_at: string
  deliverableCount: number
  readyCount: number
  approvedCount: number
  unreadMessages: number
}

export function useManagedProjects() {
  const [projects, setProjects] = useState<ManagedProjectCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch("/api/managed/projects")
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((data) => { if (active) setProjects(data.projects || []) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return { projects, loading }
}

export default function ManagedProjectCards({
  projects, loading, showEmpty = true,
}: { projects: ManagedProjectCard[]; loading: boolean; showEmpty?: boolean }) {
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  if (!projects.length) {
    if (!showEmpty) return null
    return (
      <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center">
        <p className="text-sm text-white/45">No managed projects yet.</p>
        <Link
          href="/hire-us"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          Hire our creative team
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const actionRequired = project.readyCount > 0
        return (
          <Link
            key={project.id}
            href={`/hire-us/projects/${project.id}`}
            className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-primary/40 hover:bg-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  {serviceName(project.service_type)}
                </p>
                <h3 className="mt-1 truncate text-sm font-bold">{project.name}</h3>
              </div>
              {project.unreadMessages > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/20 px-2 py-1 text-[10px] font-bold text-primary">
                  <MessageSquare className="h-3 w-3" />
                  {project.unreadMessages}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs text-white/40">
              {project.video_count} video{project.video_count === 1 ? "" : "s"}
              {project.deliverableCount > 0 && (
                <> · {project.approvedCount}/{project.deliverableCount} approved</>
              )}
            </p>

            <p className="mt-3 text-xs font-semibold text-white/60">
              {project.payment_status === "proposal_requested"
                ? "Proposal requested"
                : MANAGED_STATUS_LABELS[project.status] || project.status}
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              {actionRequired ? (
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                  Action Required
                </span>
              ) : (
                <span />
              )}
              <span className="flex items-center gap-1 text-xs font-semibold text-white/45 transition group-hover:text-primary">
                Open project
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
