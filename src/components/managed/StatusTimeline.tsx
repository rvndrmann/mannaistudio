"use client"

import { Check, Loader2 } from "lucide-react"
import { MANAGED_STATUSES, MANAGED_STATUS_BLURBS, MANAGED_STATUS_LABELS, statusIndex } from "@/lib/managed-production"

/**
 * Where the production has got to.
 *
 * Horizontal on a wide screen and vertical on a phone, because nine stages
 * squeezed into 375px is nine unreadable abbreviations. The current stage
 * carries a sentence saying who has the ball — a timeline that only names
 * stages leaves someone guessing whether "Creative Research" means anyone has
 * actually started.
 */
export default function StatusTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-semibold text-white/70">Cancelled</p>
        <p className="mt-1 text-xs text-white/40">{MANAGED_STATUS_BLURBS.cancelled}</p>
      </div>
    )
  }

  const current = Math.max(statusIndex(status), 0)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-white">{MANAGED_STATUS_LABELS[status] || "In progress"}</p>
        <p className="text-[11px] font-medium text-white/35">
          Step {current + 1} of {MANAGED_STATUSES.length}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{MANAGED_STATUS_BLURBS[status]}</p>

      <ol className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
        {MANAGED_STATUSES.map((stage, index) => {
          const done = index < current
          const active = index === current
          return (
            <li key={stage} className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-1.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold lg:h-1.5 lg:w-full lg:rounded-full ${
                  done
                    ? "bg-primary/70 text-black"
                    : active
                      ? "bg-primary text-black"
                      : "bg-white/10 text-white/30"
                }`}
              >
                <span className="lg:hidden">
                  {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : index + 1}
                </span>
              </span>
              <span
                className={`text-[11px] leading-tight ${
                  active ? "font-semibold text-white" : done ? "text-white/50" : "text-white/25"
                }`}
              >
                {MANAGED_STATUS_LABELS[stage]}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
