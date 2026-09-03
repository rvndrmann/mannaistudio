"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Clapperboard, Film, Loader2, Play, Sparkles, Zap } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import CreditPackModal from "@/components/originals/CreditPackModal"
import { DEFAULT_EPISODE_PRICE, type OriginalsSeriesSummary } from "@/lib/originals"
import { useAuth } from "@/components/auth/auth-provider"

export default function OriginalsPage() {
  const { user } = useAuth()
  const [series, setSeries] = useState<OriginalsSeriesSummary[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPacks, setShowPacks] = useState(false)
  const [genre, setGenre] = useState<string>("All")

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

  const genres = useMemo(() => {
    const found = series.map((item) => item.genre).filter((value): value is string => Boolean(value))
    return ["All", ...Array.from(new Set(found))]
  }, [series])

  const visible = genre === "All" ? series : series.filter((item) => item.genre === genre)

  // The price quoted in the header is whatever the catalogue actually charges.
  // Quoting a flat 20 while a series was set to something else would be a lie
  // told on the busiest page.
  const headlinePrice = series[0]?.episodePrice ?? DEFAULT_EPISODE_PRICE
  const headlineFree = series[0]?.freeEpisodes ?? 3

  return (
    <main className="min-h-screen bg-[#0a0a0f] pb-20">
      <Navbar />

      <div className="mx-auto max-w-7xl px-6 pt-28">
        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Clapperboard className="h-3.5 w-3.5" />
              AI Director Hub Originals
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-white md:text-5xl">
              Series made entirely with AI.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/60">
              First {headlineFree} episodes of every series are free. After that, each episode unlocks for{" "}
              <span className="font-semibold text-primary">{headlinePrice} credits</span> — kept forever, and the
              same credits work in Creator Studio.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary">
              <Zap className="h-4 w-4 fill-primary" />
              {credits !== null ? `${credits.toLocaleString()} credits` : user ? "…" : "Sign in"}
            </div>
            <button
              type="button"
              onClick={() => setShowPacks(true)}
              disabled={!user}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
              title={user ? "Buy credits" : "Sign in to buy credits"}
            >
              Get credits
            </button>
          </div>
        </div>

        {/* Genre filter */}
        {genres.length > 1 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {genres.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setGenre(item)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  genre === item
                    ? "border-primary bg-primary text-black"
                    : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* Catalogue */}
        <div className="mt-10">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-white/40">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading Originals…</span>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">{error}</div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-20 text-center">
              <Film className="mx-auto h-10 w-10 text-white/20" />
              <h2 className="mt-4 text-lg font-semibold text-white">No series published yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-white/50">
                Originals are on the way. In the meantime, you can make your own in Creator Studio.
              </p>
              <Link
                href="/studio"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
              >
                <Sparkles className="h-4 w-4" />
                Open Creator Studio
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {visible.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.4) }}
                >
                  <Link href={`/originals/${item.slug}`} className="group block">
                    {/* 9:16 poster, the short-drama shape. */}
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-[#111]">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1a1a22] to-[#0d0d12]">
                          <Film className="h-8 w-8 text-white/20" />
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-3 pt-10">
                        <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">{item.title}</p>
                        <p className="mt-1 text-[11px] text-white/50">
                          {item.episodeCount} {item.episodeCount === 1 ? "episode" : "episodes"}
                        </p>
                      </div>

                      <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                        {item.freeEpisodes} free
                      </span>

                      <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-black shadow-lg">
                          <Play className="ml-0.5 h-5 w-5 fill-black" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreditPackModal
        open={showPacks}
        onClose={() => setShowPacks(false)}
        balance={credits}
        onPurchased={setCredits}
        episodePrice={headlinePrice}
      />

      <Footer />
    </main>
  )
}
