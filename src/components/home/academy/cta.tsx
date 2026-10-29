"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { fbTrack } from "@/lib/fbpixel"
import { FREE_COURSE_PATH, PRO_CTA_LABEL, PRO_PATH } from "@/lib/course-catalog"
import { cn } from "@/lib/utils"
import { PRO_PRICE_INR } from "@/lib/display-currency"

/**
 * The two things this page asks a visitor to do, and the events that count them.
 *
 * Every Pro button is this component and every free-course link is the other,
 * so "all Pro CTAs go to /billing and fire InitiateCheckout" is true by
 * construction rather than by checking eleven links.
 */

const proEvent = { content_name: "AI Director Hub Pro", content_category: "subscription", value: PRO_PRICE_INR, currency: "INR" }

export function ProCta({ className, placement, children }: { className?: string; placement: string; children?: ReactNode }) {
  return (
    <Link
      href={PRO_PATH}
      onClick={() => fbTrack("InitiateCheckout", { ...proEvent, placement })}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-5 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground transition hover:bg-white active:scale-[0.98]",
        className,
      )}
    >
      {children ?? <>{PRO_CTA_LABEL} <ArrowRight className="h-3.5 w-3.5" /></>}
    </Link>
  )
}

export function FreeCourseCta({ className, placement, children }: { className?: string; placement: string; children?: ReactNode }) {
  return (
    <Link
      href={FREE_COURSE_PATH}
      onClick={() => fbTrack("Lead", { content_name: "Free course", placement })}
      className={cn("inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-white/60 underline-offset-4 transition hover:text-white hover:underline", className)}
    >
      {children ?? "Start the free course →"}
    </Link>
  )
}

/**
 * ViewContent, once the pixel exists.
 *
 * The pixel is injected after hydration, so on a fast load this mounts before
 * `fbq` is defined and a plain call would be dropped without a trace. Waits for
 * it — briefly, and then gives up rather than polling a blocked script forever.
 */
export function ViewContentBeacon({ name }: { name: string }) {
  useEffect(() => {
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const send = () => {
      if (typeof (window as unknown as { fbq?: unknown }).fbq === "function") {
        fbTrack("ViewContent", { content_name: name, content_category: "landing" })
        return
      }
      if (++tries < 20) timer = setTimeout(send, 500)
    }
    send()
    return () => clearTimeout(timer)
  }, [name])
  return null
}

/** The Pro button, pinned to the bottom of a phone once the hero's own has scrolled away. */
export function StickyProBar({ watch }: { watch: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const hero = document.getElementById(watch)
    if (!hero) return
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [watch])

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0d0d0d]/95 px-4 pt-3 backdrop-blur transition-transform duration-300 md:hidden",
        "pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <ProCta placement="sticky-mobile" className="h-12 w-full" />
    </div>
  )
}
