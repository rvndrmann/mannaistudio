"use client"

import type { ReactNode } from "react"
import { PhoneCall } from "lucide-react"
import { fbTrack } from "@/lib/fbpixel"
import { cn } from "@/lib/utils"

/**
 * "Book a call", for the visitor who wants to talk before buying.
 *
 * The link is set in Admin → Proof → Page settings. Callers render this only
 * when one is set, so the page has no call buttons rather than one that goes
 * nowhere.
 */
export default function BookCallButton({ href, placement, className, children }: {
  href: string
  placement: string
  className?: string
  children?: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => fbTrack("Schedule", { content_name: "Hire Us call", placement })}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-white/85 transition duration-press ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]",
        className,
      )}
    >
      {children ?? <><PhoneCall className="h-4 w-4" /> Book a free call</>}
    </a>
  )
}
