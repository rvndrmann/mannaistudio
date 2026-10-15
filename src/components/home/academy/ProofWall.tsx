"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Quote, X } from "lucide-react"
import { videoEmbedUrl } from "@/lib/video-embed"
import { cn } from "@/lib/utils"

export type WallItem = {
  id: string
  title: string
  personName: string
  personRole: string
  avatar: string
  quote: string
  screenshots: Array<{ url: string; thumb: string }>
  video: string
  poster: string
  amount: string
  date: string
}

export type Opened = { kind: "image"; url: string; alt: string } | { kind: "video"; url: string; poster: string; title: string }

const PAGE = 6

/** Past this a quote is folded: one long review was three screens tall on a phone. */
const LONG_QUOTE = 160

/**
 * Student results and client sales, as published in /admin/proof.
 *
 * A tab with nothing behind it is not drawn, and the section itself is left out
 * by the page when both are empty — there is no state of this component that
 * shows a placeholder.
 */
export default function ProofWall({ students, sales, lead = "students" }: {
  students: WallItem[]
  sales: WallItem[]
  /** Which tab opens first: the academy leads with students, Hire Us with clients. */
  lead?: "students" | "sales"
}) {
  const tabs = [
    { key: "students", label: "Student results", items: students },
    { key: "sales", label: "Client sales", items: sales },
  ]
    .sort((a, b) => Number(b.key === lead) - Number(a.key === lead))
    .filter((tab) => tab.items.length > 0)
  const [tab, setTab] = useState(tabs[0]?.key)
  const [shown, setShown] = useState(PAGE)
  const [opened, setOpened] = useState<Opened | null>(null)
  const current = tabs.find((entry) => entry.key === tab) ?? tabs[0]

  if (!current) return null

  return (
    <>
      {tabs.length > 1 && (
        <div role="tablist" className="mt-8 inline-flex rounded-lg border border-white/10 bg-black/30 p-1">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              role="tab"
              aria-selected={entry.key === current.key}
              onClick={() => { setTab(entry.key); setShown(PAGE) }}
              className={cn("min-h-10 rounded-md px-4 text-sm font-semibold transition", entry.key === current.key ? "bg-primary text-black" : "text-white/60 hover:text-white")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {current.items.slice(0, shown).map((item) => (
          <ProofCard key={item.id} item={item} onOpen={setOpened} />
        ))}
      </div>

      {current.items.length > shown && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => setShown((count) => count + PAGE)} className="inline-flex h-11 items-center rounded-md border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">Show more</button>
        </div>
      )}

      {opened && <ProofLightbox opened={opened} onClose={() => setOpened(null)} />}
    </>
  )
}

/** One review or sale, as drawn on the wall and in the featured strip's box. */
export function ProofCard({ item, onOpen, foldQuote = true, className }: {
  item: WallItem
  onOpen: (opened: Opened) => void
  /** The wall folds a long review; the box it opens into has room for all of it. */
  foldQuote?: boolean
  className?: string
}) {
  const [unfolded, setUnfolded] = useState(false)

  return (
    <article className={cn("flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[.03] p-5", className)}>
      <div className="flex items-center gap-3">
        {item.avatar
          ? <img src={item.avatar} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{(item.personName || item.title).charAt(0).toUpperCase()}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.personName || item.title}</p>
          {item.personRole && <p className="truncate text-xs text-white/50">{item.personRole}</p>}
        </div>
        {item.amount && <span className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{item.amount}</span>}
      </div>

      {item.personName && item.title && <p className="mt-4 text-sm font-semibold text-white/90">{item.title}</p>}
      {/* The screenshot is the evidence, so it is shown at a size it can
          be read at rather than as a thumbnail to go looking behind. The
          first one leads; any others sit under it. */}
      {item.screenshots.length > 0 && (
        <button
          type="button"
          onClick={() => onOpen({ kind: "image", url: item.screenshots[0].url, alt: `${item.personName || item.title} — screenshot 1` })}
          aria-label="Open screenshot 1 full size"
          className="mt-4 block overflow-hidden rounded-xl border border-white/10 bg-black transition hover:border-primary/50"
        >
          <img src={item.screenshots[0].url} alt={`Review screenshot from ${item.personName || item.title}`} loading="lazy" decoding="async" className="max-h-80 w-full object-contain object-top" />
        </button>
      )}
      {item.screenshots.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.screenshots.slice(1).map((shot, position) => (
            <button
              key={shot.url}
              type="button"
              onClick={() => onOpen({ kind: "image", url: shot.url, alt: `${item.personName || item.title} — screenshot ${position + 2}` })}
              aria-label={`Open screenshot ${position + 2}`}
              className="h-16 w-16 overflow-hidden rounded-lg border border-white/10 transition hover:border-primary/50"
            >
              <img src={shot.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {item.quote && (() => {
        const long = item.quote.length > LONG_QUOTE
        const open = unfolded || !foldQuote
        return (
          <blockquote className="mt-4 flex gap-2 text-sm leading-relaxed text-white/70">
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
            <div className="min-w-0">
              <p className={cn("whitespace-pre-line break-words", long && !open && "line-clamp-4")}>{item.quote}</p>
              {long && foldQuote && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setUnfolded(!open)}
                  className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-white/90 underline underline-offset-4 hover:text-white"
                >
                  {open ? "Show less" : "Read full review"}
                </button>
              )}
            </div>
          </blockquote>
        )
      })()}

      {item.video && item.poster && (
        <button
          type="button"
          onClick={() => onOpen({ kind: "video", url: item.video, poster: item.poster, title: item.title })}
          aria-label={`Play video: ${item.title || item.personName}`}
          className="relative mt-4 block aspect-video overflow-hidden rounded-xl border border-white/10"
        >
          <img src={item.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25"><span className="grid h-12 w-12 place-items-center rounded-full bg-black/60"><Play className="h-4 w-4 translate-x-0.5 fill-current" /></span></span>
        </button>
      )}

      {item.date && <p className="mt-auto pt-4 text-xs text-white/35">{item.date}</p>}
    </article>
  )
}

/** A screenshot at full size, or the video, over everything else. */
export function ProofLightbox({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    // Captured first and stopped there, so Escape closes the screenshot and
    // not the review box it was opened from.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); close.current() } }
    document.addEventListener("keydown", onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = overflow }
  }, [])

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
      <div className="max-h-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
        {opened.kind === "image" ? (
          <img src={opened.url} alt={opened.alt} className="max-h-[88vh] w-auto rounded-lg object-contain" />
        ) : videoEmbedUrl(opened.url) ? (
          <iframe src={videoEmbedUrl(opened.url, { autoplay: true })!} title={opened.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-[min(90vw,56rem)] rounded-lg" />
        ) : (
          <video src={opened.url} poster={opened.poster} controls autoPlay playsInline className="max-h-[88vh] w-auto rounded-lg" />
        )}
      </div>
    </div>
  )
}
