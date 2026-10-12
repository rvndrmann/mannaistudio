"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Play } from "lucide-react"
import { videoEmbedUrl } from "@/lib/video-embed"
import { cn } from "@/lib/utils"

export type WorkItem = { id: string; title: string; label: string; video: string; poster: string }

const COLUMNS = 3
const FIRST_ROWS = 2

/**
 * Client-grade work: a swipe row on a phone, a three-column grid above it.
 *
 * Every card is its poster until someone asks for more — hover on a desktop,
 * a tap anywhere — so the section is seven small images on arrival and not
 * seven ad files.
 *
 * The grid only ever shows whole rows. One list feeds both layouts, and a card
 * that would start an incomplete row is hidden from the grid but stays in the
 * swipe row, where there is no such thing as an orphan.
 */
export default function WorkGallery({ items }: { items: WorkItem[] }) {
  const [expanded, setExpanded] = useState(false)
  // Fewer than one full row is shown as it is: hiding the only work there is
  // would be a worse answer than a short row.
  const wholeRows = items.length < COLUMNS ? items.length : Math.floor(items.length / COLUMNS) * COLUMNS
  const firstScreen = Math.min(wholeRows, COLUMNS * FIRST_ROWS)
  const inGrid = expanded ? wholeRows : firstScreen

  return (
    <>
      <ul className="-mx-5 mt-9 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:-mx-8 sm:px-8 md:mx-auto md:grid md:max-w-5xl md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item, position) => (
          <li key={item.id} className={cn("w-[68vw] max-w-[300px] shrink-0 snap-center md:w-auto md:max-w-none", position >= inGrid && "md:hidden")}>
            <WorkCard item={item} />
          </li>
        ))}
      </ul>
      {wholeRows > firstScreen && !expanded && (
        <div className="mt-8 hidden justify-center md:flex">
          <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10">
            See all work <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}

function WorkCard({ item }: { item: WorkItem }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const embed = videoEmbedUrl(item.video, { autoplay: true, muted: true, loop: true })

  // Stops when swiped or scrolled away, so a row of tapped cards is never a
  // row of videos all playing off screen.
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active || !frame.current) return
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setActive(false) }, { threshold: 0.2 })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [active])

  useEffect(() => {
    if (active) ref.current?.play().catch(() => {})
  }, [active])

  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches

  return (
    <figure className="group">
      <div
        ref={frame}
        className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f0e]"
        // An embed is a third-party player: it loads on a click, never on a
        // pointer merely passing over the card.
        onMouseEnter={() => { if (!embed && canHover()) setActive(true) }}
        onMouseLeave={() => { if (!embed && canHover()) setActive(false) }}
      >
        <img src={item.poster} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
        <img src={item.poster} alt={item.title} loading="lazy" decoding="async" className="relative h-full w-full object-contain" />
        {active && (embed ? (
          <iframe src={embed} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
        ) : (
          <video ref={ref} src={item.video} poster={item.poster} muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full bg-black object-contain" />
        ))}
        {!(active && embed) && (
          <button
            type="button"
            aria-label={active ? `Pause ${item.title}` : `Play ${item.title}`}
            onClick={() => setActive((current) => !current)}
            className="absolute inset-0 grid place-items-center"
          >
            <span className={cn("grid h-14 w-14 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition", active ? "opacity-0" : "opacity-100 group-hover:scale-105")}>
              <Play className="h-5 w-5 translate-x-0.5 fill-current" />
            </span>
          </button>
        )}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary backdrop-blur-sm">{item.label}</span>
      </div>
      <figcaption className="mt-3 text-sm font-semibold text-white/90">{item.title}</figcaption>
    </figure>
  )
}
