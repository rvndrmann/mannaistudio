"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Film, Loader2, Play, Zap } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import CreditPackModal from "@/components/originals/CreditPackModal"
import { DEFAULT_EPISODE_PRICE, type OriginalsSeriesSummary } from "@/lib/originals"
import { useAuth } from "@/components/auth/auth-provider"

/** A horizontally scrolling shelf of posters, the way a catalogue is browsed. */
function Row({ title, items }: { title: string; items: OriginalsSeriesSummary[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState({ left: false, right: false })

  // Arrows are only drawn when they would do something — a dead arrow on a
  // shelf of three posters reads as a broken control.
  const measure = () => {
    const el = trackRef.current
    if (!el) return
    setCanScroll({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    })
  }

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    el.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    return () => {
      el.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
    }
  }, [items.length])

  const nudge = (direction: 1 | -1) => {
    trackRef.current?.scrollBy({ left: direction * Math.round(trackRef.current.clientWidth * 0.8), behavior: "smooth" })
  }

  if (items.length === 0) return null

  return (
    <section className="group/row relative mt-12">
      <div className="mb-4 flex items-end justify-between px-1">
        <h2 className="text-xl font-semibold tracking-[-0.01em] sm:text-2xl">{title}</h2>
      </div>

      <div className="relative">
        {canScroll.left && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => nudge(-1)}
            className="absolute -left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black md:grid"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {canScroll.right && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => nudge(1)}
            className="absolute -right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black md:grid"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div
          ref={trackRef}
          className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/originals/${item.slug}`}
              className="group/card w-[150px] shrink-0 sm:w-[190px]"
            >
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#141418]">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover/card:scale-105"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center"><Film className="h-7 w-7 text-white/15" /></div>
                )}

                <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                  {item.freeEpisodes} free
                </span>

                <div className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover/card:opacity-100">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-black">
                    <Play className="ml-0.5 h-5 w-5 fill-black" />
                  </span>
                </div>
              </div>

              <p className="mt-2.5 line-clamp-2 text-sm font-semibold leading-tight">{item.title}</p>
              <p className="mt-1 text-[11px] text-white/40">
                {[item.genre, `${item.episodeCount} eps`].filter(Boolean).join(" | ")}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function OriginalsPage() {
  const { user } = useAuth()
  const [series, setSeries] = useState<OriginalsSeriesSummary[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPacks, setShowPacks] = useState(false)
  const [heroIndex, setHeroIndex] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/originals", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not load Originals")
        setSeries(data.series || [])
        setCredits(data.credits)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load Originals")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id])

  // The banner rotates through the first few titles; the rest of the catalogue
  // is grouped by genre below it.
  const spotlight = useMemo(() => series.slice(0, 5), [series])
  const hero = spotlight[heroIndex] ?? null

  const byGenre = useMemo(() => {
    const groups = new Map<string, OriginalsSeriesSummary[]>()
    for (const item of series) {
      const key = item.genre?.trim() || "More Originals"
      const bucket = groups.get(key)
      if (bucket) bucket.push(item)
      else groups.set(key, [item])
    }
    return Array.from(groups.entries())
  }, [series])

  const headlinePrice = series[0]?.episodePrice ?? DEFAULT_EPISODE_PRICE

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <Navbar />

      {loading ? (
        <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="mx-auto max-w-md px-6 pt-40 text-center text-white/60">{error}</div>
      ) : series.length === 0 ? (
        <div className="mx-auto max-w-md px-6 pt-40 text-center">
          <Film className="mx-auto h-10 w-10 text-white/15" />
          <h1 className="mt-4 text-xl font-semibold">No series published yet</h1>
          <p className="mt-2 text-sm text-white/45">Originals are on the way — check back soon.</p>
        </div>
      ) : (
        <>
          {/* Hero banner */}
          {hero && (
            <section className="relative min-h-[520px] overflow-hidden">
              <div className="absolute inset-0">
                {hero.bannerUrl || hero.posterUrl ? (
                  <img
                    key={hero.id}
                    src={hero.bannerUrl || hero.posterUrl || ""}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover object-top"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/85 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/60" />
              </div>

              <div className="relative mx-auto flex min-h-[520px] max-w-7xl flex-col justify-end px-6 pb-14 pt-32">
                <div className="max-w-xl">
                  <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-5xl">{hero.title}</h1>
                  {hero.genre && (
                    <span className="mt-4 inline-block rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                      {hero.genre}
                    </span>
                  )}
                  {hero.description && (
                    <p className="mt-4 line-clamp-2 max-w-lg text-sm leading-relaxed text-white/60">{hero.description}</p>
                  )}
                  <Link
                    href={`/originals/${hero.slug}`}
                    className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-white px-9 py-3.5 text-sm font-bold text-black transition hover:bg-white/90"
                  >
                    <Play className="h-4 w-4 fill-black" />
                    Play
                  </Link>
                  <p className="mt-4 text-xs text-white/40">
                    First {hero.freeEpisodes} episodes free · {hero.episodePrice} credits each after
                  </p>
                </div>

                {/* Spotlight picker */}
                {spotlight.length > 1 && (
                  <div className="mt-10 flex items-center gap-3 self-end">
                    <button
                      type="button"
                      aria-label="Previous"
                      onClick={() => setHeroIndex((i) => (i - 1 + spotlight.length) % spotlight.length)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white/70 transition hover:bg-black/80 hover:text-white"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex gap-3">
                      {spotlight.map((item, i) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setHeroIndex(i)}
                          title={item.title}
                          className={`h-[104px] w-[72px] overflow-hidden rounded-lg border-2 transition ${
                            i === heroIndex ? "border-white" : "border-transparent opacity-60 hover:opacity-100"
                          }`}
                        >
                          {item.posterUrl ? (
                            <img src={item.posterUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center bg-white/5"><Film className="h-4 w-4 text-white/25" /></div>
                          )}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label="Next"
                      onClick={() => setHeroIndex((i) => (i + 1) % spotlight.length)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white/70 transition hover:bg-black/80 hover:text-white"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="mx-auto max-w-7xl px-6 pb-20">
            <Row title="New Release" items={series} />
            {byGenre.map(([genre, items]) => (
              <Row key={genre} title={genre} items={items} />
            ))}

            {/* Credits */}
            <section className="mt-16 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
              <Zap className="mx-auto h-7 w-7 text-primary" />
              <h2 className="mt-3 text-xl font-semibold">Out of credits?</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
                Every series opens free. After that it&apos;s {headlinePrice} credits an episode, yours to keep — no subscription.
              </p>
              <button
                type="button"
                onClick={() => setShowPacks(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                <Zap className="h-4 w-4 fill-black" />
                {credits !== null ? `${credits.toLocaleString()} credits — top up` : "Get credits"}
              </button>
            </section>
          </div>
        </>
      )}

      <Footer />

      <CreditPackModal
        open={showPacks}
        onClose={() => setShowPacks(false)}
        balance={credits}
        onPurchased={(balance) => { setCredits(balance); setShowPacks(false) }}
        episodePrice={headlinePrice}
      />
    </main>
  )
}
