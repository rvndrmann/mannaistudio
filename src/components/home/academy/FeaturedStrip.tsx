"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Play, Quote, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProofCard, ProofLightbox, type Opened, type WallItem } from "@/components/home/academy/ProofWall"

export type FeaturedEntry = {
  id: string
  /** The small grey line: a category, "Client sale" or "Student result". */
  label: string
  /** Shown in the brand colour after the label — a sale's amount. */
  amount: string
  name: string
  image: string
  /** A review or sale opens as its card; a piece of work opens its video. */
  review: WallItem | null
  video: { url: string; poster: string; title: string } | null
}

/**
 * The row of featured proof under the hero.
 *
 * Drawn in the order set in /admin/proof; a phone shows the first two before
 * anyone swipes. A tap opens the review itself in a small box rather than
 * scrolling the visitor away to the wall further down.
 */
export default function FeaturedStrip({ items, cellClass }: { items: FeaturedEntry[]; cellClass: string }) {
  const [review, setReview] = useState<WallItem | null>(null)
  const [opened, setOpened] = useState<Opened | null>(null)

  useEffect(() => {
    if (!review) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setReview(null) }
    document.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow }
  }, [review])

  return (
    <>
      {/* Two by two on a phone, so the first four are all on screen without a
          sideways swipe; one row of six on a desktop. The 1px gap over a tinted
          list draws the dividers in both layouts. */}
      <ul className={`grid grid-cols-2 gap-px border-t ${cellClass} bg-white/[.08] lg:grid-cols-6`}>
        {items.map((item, position) => (
          <li key={item.id} className={cn("min-w-0 bg-background", position >= 4 && "hidden lg:block")}>
            <button
              type="button"
              onClick={() => {
                if (item.review) setReview(item.review)
                else if (item.video) setOpened({ kind: "video", url: item.video.url, poster: item.video.poster, title: item.video.title })
              }}
              aria-label={item.review ? `Open review: ${item.name}` : `Play ${item.name}`}
              className="flex h-full w-full items-center gap-2.5 p-3 text-left transition hover:bg-white/[.03] sm:gap-3 sm:p-4"
            >
              <span className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
                {item.image
                  ? <img src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-md object-cover" />
                  : <span className="grid h-full w-full place-items-center rounded-md bg-white/[.06] text-white/60"><Quote className="h-4 w-4" /></span>}
                {item.video && !item.review && (
                  <span className="absolute inset-0 grid place-items-center rounded-md bg-black/30"><Play className="h-3.5 w-3.5 translate-x-px fill-current" /></span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-white/40">{item.label}{item.amount && <> · <span className="text-brand">{item.amount}</span></>}</span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">{item.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {review && (
        <div role="dialog" aria-modal="true" aria-label={review.personName || review.title} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setReview(null)}>
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#121212] p-2 pt-12 sm:max-w-md sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Close" onClick={() => setReview(null)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-4 w-4" /></button>
            <ProofCard item={review} onOpen={setOpened} foldQuote={false} className="border-0 bg-transparent" />
            <a href="#proof" onClick={() => setReview(null)} className="mx-5 mb-4 mt-1 inline-flex min-h-10 items-center gap-2 text-xs text-white/60 hover:text-white">See all results <ArrowRight className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      )}

      {opened && <ProofLightbox opened={opened} onClose={() => setOpened(null)} />}
    </>
  )
}
