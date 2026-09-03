"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ArrowLeft, Check, Film, Loader2, Lock, Play, X, Zap } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import CreditPackModal from "@/components/originals/CreditPackModal"
import { useAuth } from "@/components/auth/auth-provider"
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events"
import {
  DEFAULT_EPISODE_PRICE,
  formatEpisodeDuration,
  type OriginalsEpisodeSummary,
  type OriginalsSeriesDetail,
} from "@/lib/originals"

export default function OriginalsSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user, signInWithGoogle } = useAuth()

  const [series, setSeries] = useState<OriginalsSeriesDetail | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openingId, setOpeningId] = useState<string | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [showPacks, setShowPacks] = useState(false)
  const [playing, setPlaying] = useState<{ episode: OriginalsEpisodeSummary; videoUrl: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/originals/${slug}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load this series")
      setSeries(data.series)
      setCredits(data.credits)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this series")
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load, user?.id])

  const episodePrice = series?.episodePrice ?? DEFAULT_EPISODE_PRICE

  const openEpisode = async (episode: OriginalsEpisodeSummary) => {
    if (!user) {
      signInWithGoogle()
      return
    }
    setOpeningId(episode.id)
    setUnlockError(null)
    try {
      const res = await fetch("/api/originals/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      })
      const data = await res.json()

      if (res.status === 402) {
        // Short on credits is the moment the packs are worth showing, not an
        // error to leave sitting on the page.
        setCredits(Number(data.balance) || 0)
        setUnlockError(data.error)
        setShowPacks(true)
        return
      }
      if (!res.ok) throw new Error(data.error || "Could not open this episode")

      setCredits(Number(data.balance))
      if (data.status === "purchased") {
        notifyCreditBalanceChanged(Number(data.balance))
        // Mark it owned locally so the list redraws without a round trip.
        setSeries((current) =>
          current
            ? {
                ...current,
                episodes: current.episodes.map((item) =>
                  item.id === episode.id ? { ...item, isUnlocked: true } : item,
                ),
              }
            : current,
        )
      }
      setPlaying({ episode, videoUrl: data.videoUrl })
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Could not open this episode")
    } finally {
      setOpeningId(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0f]">
        <Navbar />
        <div className="flex items-center justify-center gap-3 pt-48 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading series…</span>
        </div>
      </main>
    )
  }

  if (error || !series) {
    return (
      <main className="min-h-screen bg-[#0a0a0f]">
        <Navbar />
        <div className="mx-auto max-w-2xl px-6 pt-40 text-center">
          <Film className="mx-auto h-10 w-10 text-white/20" />
          <h1 className="mt-4 text-xl font-semibold text-white">{error || "Series not found"}</h1>
          <Link
            href="/originals"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Originals
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] pb-20">
      <Navbar />

      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 h-[420px] overflow-hidden">
          {series.bannerUrl || series.posterUrl ? (
            <img
              src={series.bannerUrl || series.posterUrl || ""}
              alt=""
              aria-hidden
              className="h-full w-full object-cover opacity-30 blur-2xl"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f]/70 to-[#0a0a0f]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-28">
          <Link
            href="/originals"
            className="inline-flex items-center gap-2 text-xs font-semibold text-white/50 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            All Originals
          </Link>

          <div className="mt-6 flex flex-col gap-8 md:flex-row">
            <div className="w-40 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111] sm:w-52">
              <div className="aspect-[9/16]">
                {series.posterUrl ? (
                  <img src={series.posterUrl} alt={series.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <Film className="h-8 w-8 text-white/20" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1">
              {series.genre && (
                <span className="inline-block rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-white/70">
                  {series.genre}
                </span>
              )}
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-white md:text-4xl">{series.title}</h1>
              <p className="mt-2 text-sm text-white/50">
                {series.episodeCount} {series.episodeCount === 1 ? "episode" : "episodes"} · first{" "}
                {series.freeEpisodes} free · {episodePrice} credits each after
              </p>
              {series.description && (
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">{series.description}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {series.episodes[0] && (
                  <button
                    type="button"
                    onClick={() => openEpisode(series.episodes[0])}
                    disabled={openingId !== null}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    {openingId === series.episodes[0].id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-black" />
                    )}
                    Start watching free
                  </button>
                )}
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
                  <Zap className="h-4 w-4 fill-primary" />
                  {credits !== null ? `${credits.toLocaleString()} credits` : "Sign in"}
                </div>
                {user && (
                  <button
                    type="button"
                    onClick={() => setShowPacks(true)}
                    className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    Get credits
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes */}
      <div className="mx-auto mt-12 max-w-6xl px-6">
        <h2 className="text-lg font-semibold text-white">Episodes</h2>

        {unlockError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{unlockError}</span>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {series.episodes.map((episode) => {
            const locked = !episode.isFree && !episode.isUnlocked
            const busy = openingId === episode.id
            return (
              <button
                key={episode.id}
                type="button"
                onClick={() => openEpisode(episode)}
                disabled={busy}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-60"
              >
                <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-[#111]">
                  {episode.thumbnailUrl ? (
                    <img src={episode.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <Film className="h-4 w-4 text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    {locked ? <Lock className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 fill-white text-white" />}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    <span className="text-white/40">E{episode.episodeNumber}</span> {episode.title}
                  </p>
                  {episode.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-white/50">{episode.description}</p>
                  )}
                  {episode.durationSeconds ? (
                    <p className="mt-0.5 text-[11px] text-white/35">{formatEpisodeDuration(episode.durationSeconds)}</p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                  ) : episode.isFree ? (
                    <span className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                      Free
                    </span>
                  ) : episode.isUnlocked ? (
                    <span className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                      <Check className="h-3 w-3" />
                      Owned
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                      <Zap className="h-3 w-3 fill-primary" />
                      {episodePrice}
                    </span>
                  )}
                </div>
              </button>
            )
          })}

          {series.episodes.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center text-sm text-white/40">
              No episodes published yet.
            </p>
          )}
        </div>
      </div>

      {/* Player */}
      <AnimatePresence>
        {playing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setPlaying(null)}
          >
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-black"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => setPlaying(null)}
                aria-label="Close player"
                className="absolute right-3 top-3 z-10 rounded-xl bg-black/60 p-2 text-white/70 transition hover:bg-black/80 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <video
                src={playing.videoUrl}
                controls
                autoPlay
                playsInline
                className="aspect-[9/16] w-full bg-black"
              />
              <div className="border-t border-white/10 p-4">
                <p className="text-sm font-semibold text-white">
                  <span className="text-white/40">E{playing.episode.episodeNumber}</span> {playing.episode.title}
                </p>
                <p className="mt-0.5 text-xs text-white/40">{series.title}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreditPackModal
        open={showPacks}
        onClose={() => setShowPacks(false)}
        balance={credits}
        onPurchased={(newBalance) => {
          setCredits(newBalance)
          setUnlockError(null)
        }}
        episodePrice={episodePrice}
      />

      <Footer />
    </main>
  )
}
