"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ArrowLeft, Bookmark, Film, Loader2, Lock, Maximize, Pause, Play, Share2, SkipForward, Volume2, VolumeX, Zap } from "lucide-react"
import Navbar from "@/components/Navbar"
import CreditPackModal from "@/components/originals/CreditPackModal"
import EpisodePaywall from "@/components/originals/EpisodePaywall"
import { useAuth } from "@/components/auth/auth-provider"
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events"
import {
  DEFAULT_EPISODE_PRICE,
  formatEpisodeDuration,
  type OriginalsEpisodeSummary,
  type OriginalsSeriesDetail,
} from "@/lib/originals"

/** Episodes per page in the number grid, matching how long series are browsed. */
const GRID_PAGE = 50

/** Seconds as m:ss, the way a player clock reads. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

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
  /** The episode whose card is selected but not yet paid for. */
  const [previewing, setPreviewing] = useState<OriginalsEpisodeSummary | null>(null)
  const [ended, setEnded] = useState(false)
  const [gridPage, setGridPage] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  /** Seconds left on the auto-advance offer at the end of an episode. */
  const [autoIn, setAutoIn] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

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

  useEffect(() => { load() }, [load, user?.id])

  const episodePrice = series?.episodePrice ?? DEFAULT_EPISODE_PRICE
  const episodes = useMemo(() => series?.episodes ?? [], [series])

  /** The episode on screen, whether it is playing or waiting to be unlocked. */
  const current = playing?.episode ?? previewing
  const currentIndex = current ? episodes.findIndex((e) => e.id === current.id) : -1
  const nextEpisode = currentIndex >= 0 ? episodes[currentIndex + 1] : undefined

  const openEpisode = useCallback(async (episode: OriginalsEpisodeSummary) => {
    setPreviewing(episode)
    setEnded(false)
    setUnlockError(null)

    // A locked episode shows its price on the player rather than charging on a
    // tap: the card grid is browsed, and a click there should never be the
    // thing that spends credits.
    const playsFree = episode.isFree || episode.isUnlocked
    if (!playsFree) {
      setPlaying(null)
      return
    }

    setOpeningId(episode.id)
    try {
      const res = await fetch("/api/originals/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not open this episode")
      setCredits(Number(data.balance))
      setPlaying({ episode, videoUrl: data.videoUrl })
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Could not open this episode")
    } finally {
      setOpeningId(null)
    }
  }, [user, signInWithGoogle])

  /** Pays for the episode on screen and starts it. */
  const unlockCurrent = async () => {
    if (!current) return
    if (!user) { signInWithGoogle(); return }
    setOpeningId(current.id)
    setUnlockError(null)
    try {
      const res = await fetch("/api/originals/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: current.id }),
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
      if (!res.ok) throw new Error(data.error || "Could not unlock this episode")

      setCredits(Number(data.balance))
      if (data.status === "purchased") {
        notifyCreditBalanceChanged(Number(data.balance))
        setSeries((s) => s ? {
          ...s,
          episodes: s.episodes.map((e) => e.id === current.id ? { ...e, isUnlocked: true } : e),
        } : s)
      }
      setEnded(false)
      setPlaying({ episode: { ...current, isUnlocked: true }, videoUrl: data.videoUrl })
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Could not unlock this episode")
    } finally {
      setOpeningId(null)
    }
  }

  // Open the first episode once the series arrives, so the page starts on
  // something watchable rather than an empty frame. Safe for signed-out
  // visitors now that the opening episodes play without an account.
  useEffect(() => {
    if (!series || current || episodes.length === 0) return
    openEpisode(episodes[0])
  }, [series, current, episodes, openEpisode])

  // The next episode offers itself rather than waiting to be found. Only when
  // it will actually play — counting down to a paywall would be a countdown to
  // a bill, which is not a thing to spring on someone.
  useEffect(() => {
    if (!ended || !nextEpisode) { setAutoIn(null); return }
    const playsOn = nextEpisode.isFree || nextEpisode.isUnlocked
    if (!playsOn) { setAutoIn(null); return }

    setAutoIn(5)
    const timer = setInterval(() => {
      setAutoIn((left) => {
        if (left === null) return null
        if (left <= 1) {
          clearInterval(timer)
          openEpisode(nextEpisode)
          return null
        }
        return left - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [ended, nextEpisode, openEpisode])

  // Keep the grid on the page holding whatever is playing.
  useEffect(() => {
    if (currentIndex >= 0) setGridPage(Math.floor(currentIndex / GRID_PAGE))
  }, [currentIndex])

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked; nothing useful to say */ }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0f]">
        <Navbar />
        <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </main>
    )
  }

  if (error || !series) {
    return (
      <main className="min-h-screen bg-[#0a0a0f]">
        <Navbar />
        <div className="mx-auto max-w-md px-6 pt-40 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-4 text-white/70">{error || "Series not found"}</p>
          <Link href="/originals" className="mt-6 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-black">
            Back to Originals
          </Link>
        </div>
      </main>
    )
  }

  const pageCount = Math.max(1, Math.ceil(episodes.length / GRID_PAGE))
  const pageEpisodes = episodes.slice(gridPage * GRID_PAGE, (gridPage + 1) * GRID_PAGE)
  const locked = Boolean(current && !current.isFree && !current.isUnlocked)

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          {/* Player */}
          <div className="flex gap-4">
            <Link
              href="/originals"
              aria-label="Back to Originals"
              className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white sm:grid"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Sized by height, not width: a 9:16 frame at full column width is
                taller than the viewport, which pushed the controls off screen. */}
            <div className="relative mx-auto aspect-[9/16] h-[min(calc(100vh-9rem),740px)] max-w-full overflow-hidden rounded-2xl bg-black">
              <div className="relative h-full w-full">
                {playing && !locked ? (
                  <video
                    ref={videoRef}
                    key={playing.episode.id}
                    src={playing.videoUrl}
                    autoPlay
                    playsInline
                    onEnded={() => { setEnded(true); setIsPlaying(false) }}
                    onPlay={() => { setEnded(false); setIsPlaying(true) }}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onClick={togglePlay}
                    className="h-full w-full cursor-pointer bg-black object-contain"
                  />
                ) : (
                  <div className="absolute inset-0">
                    {current?.thumbnailUrl || series.posterUrl ? (
                      <img
                        src={current?.thumbnailUrl || series.posterUrl || ""}
                        alt=""
                        className="h-full w-full object-cover opacity-40"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center"><Film className="h-10 w-10 text-white/15" /></div>
                    )}
                  </div>
                )}

                {/* Selected but not started — the tap that begins playback,
                    and the one that asks a signed-out visitor to sign in. */}
                {current && !playing && !locked && (
                  <button
                    type="button"
                    onClick={() => openEpisode(current)}
                    disabled={openingId === current.id}
                    className="absolute inset-0 grid place-items-center bg-black/40 transition hover:bg-black/25"
                  >
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-black shadow-xl">
                      {openingId === current.id
                        ? <Loader2 className="h-6 w-6 animate-spin" />
                        : <Play className="ml-1 h-6 w-6 fill-black" />}
                    </span>
                    {current.isFree && (
                      <span className="absolute bottom-8 text-xs font-medium text-white/70">
                        Episode {current.episodeNumber} — free to watch
                      </span>
                    )}
                  </button>
                )}

                {/* Paywall */}
                {locked && current && (
                  <EpisodePaywall
                    episode={current}
                    seriesId={series.id}
                    seriesTitle={series.title}
                    posterUrl={series.posterUrl}
                    episodePrice={episodePrice}
                    balance={credits}
                    signedIn={Boolean(user)}
                    onSignIn={() => signInWithGoogle()}
                    onUnlock={unlockCurrent}
                    unlocking={openingId === current.id}
                    onBalanceChange={setCredits}
                    onPassPurchased={async () => { await load(); openEpisode(current) }}
                    error={unlockError}
                  />
                )}

                {/* End of episode — the way on to the next one */}
                <AnimatePresence>
                  {ended && !locked && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center"
                    >
                      <div>
                        {nextEpisode ? (
                          <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Up next</p>
                            <p className="mt-1.5 text-lg font-semibold">
                              Episode {nextEpisode.episodeNumber}
                            </p>
                            {/* Most episodes are titled "Episode N", which the
                                line above already says. */}
                            {nextEpisode.title && nextEpisode.title.trim() !== `Episode ${nextEpisode.episodeNumber}` && (
                              <p className="mt-0.5 line-clamp-1 text-sm text-white/55">{nextEpisode.title}</p>
                            )}
                            <button
                              type="button"
                              onClick={() => openEpisode(nextEpisode)}
                              disabled={openingId === nextEpisode.id}
                              className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
                            >
                              {openingId === nextEpisode.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <><SkipForward className="h-4 w-4 fill-black" />
                                    {autoIn !== null ? `Next episode in ${autoIn}` : "Next episode"}</>}
                            </button>
                            {!nextEpisode.isFree && !nextEpisode.isUnlocked && (
                              <p className="mt-2.5 text-xs text-white/45">Costs {episodePrice} credits</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-lg font-semibold">That&apos;s the last episode.</p>
                            <Link
                              href="/originals"
                              className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-bold text-black transition hover:brightness-110"
                            >
                              <Play className="h-4 w-4 fill-black" />Browse more series
                            </Link>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => { setAutoIn(null); setEnded(false); videoRef.current?.play() }}
                          className="mt-3 text-xs font-medium text-white/50 underline-offset-2 hover:text-white hover:underline"
                        >
                          {autoIn !== null ? "Stay here" : "Watch again"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Player controls. Built by hand rather than using the native
                  bar, because Next has to sit beside play/pause and a native
                  control set cannot be added to. */}
              {playing && !locked && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-8">
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (videoRef.current) videoRef.current.currentTime = next
                      setCurrentTime(next)
                    }}
                    aria-label="Seek"
                    className="mb-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[#b9f42e] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                  />

                  <div className="flex items-center gap-3 text-white">
                    <button type="button" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="transition hover:text-primary">
                      {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => nextEpisode && openEpisode(nextEpisode)}
                      disabled={!nextEpisode || openingId === nextEpisode?.id}
                      aria-label="Next episode"
                      title={nextEpisode ? `Next: Episode ${nextEpisode.episodeNumber}` : "Last episode"}
                      className="transition hover:text-primary disabled:opacity-30 disabled:hover:text-white"
                    >
                      {openingId && nextEpisode && openingId === nextEpisode.id
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <SkipForward className="h-5 w-5 fill-current" />}
                    </button>

                    <span className="text-xs tabular-nums text-white/80">
                      {formatClock(currentTime)} / {formatClock(duration)}
                    </span>

                    <div className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!videoRef.current) return
                          videoRef.current.muted = !videoRef.current.muted
                          setMuted(videoRef.current.muted)
                        }}
                        aria-label={muted ? "Unmute" : "Mute"}
                        className="transition hover:text-primary"
                      >
                        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const el = videoRef.current
                          if (!el) return
                          if (document.fullscreenElement) document.exitFullscreen()
                          else el.requestFullscreen?.()
                        }}
                        aria-label="Fullscreen"
                        className="transition hover:text-primary"
                      >
                        <Maximize className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div>
            <nav className="flex flex-wrap items-center gap-1.5 text-sm text-white/45">
              <Link href="/" className="hover:text-white">Home</Link>
              <span>/</span>
              <Link href="/originals" className="hover:text-white">Originals</Link>
              <span>/</span>
              <span className="text-white/70">{series.title}</span>
              {current && (<><span>/</span><span className="text-white/70">Episode {current.episodeNumber}</span></>)}
            </nav>

            <h1 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">
              {current ? `Episode ${current.episodeNumber} — ${series.title}` : series.title}
            </h1>

            {(current?.description || series.description) && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-white/80">
                  {current ? `Plot of Episode ${current.episodeNumber}` : "About this series"}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {current?.description || series.description}
                </p>
              </div>
            )}

            {(series.genre || series.tags.length > 0) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {[series.genre, ...series.tags].filter(Boolean).map((tag) => (
                  <span key={tag as string} className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/65">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-8 border-y border-white/[0.08] py-4">
              <div className="text-center">
                <Bookmark className="mx-auto h-5 w-5 text-white/60" />
                <p className="mt-1 text-xs text-white/45">{episodes.length} episodes</p>
              </div>
              <div className="text-center">
                <Zap className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-1 text-xs text-white/45">{episodePrice} per episode</p>
              </div>
              <button type="button" onClick={share} className="text-center">
                <Share2 className="mx-auto h-5 w-5 text-white/60" />
                <p className="mt-1 text-xs text-white/45">{copied ? "Copied!" : "Share"}</p>
              </button>
            </div>

            {/* Episode grid */}
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-4">
                {Array.from({ length: pageCount }, (_, i) => {
                  const from = i * GRID_PAGE + 1
                  const to = Math.min((i + 1) * GRID_PAGE, episodes.length)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGridPage(i)}
                      className={`text-sm font-semibold transition ${gridPage === i ? "text-white" : "text-white/40 hover:text-white/70"}`}
                    >
                      {from} - {to}
                    </button>
                  )
                })}
                <span className="ml-auto text-xs text-white/35">
                  {series.freeEpisodes} free, then {episodePrice} credits each
                </span>
              </div>

              <div className="mt-4 grid grid-cols-6 gap-2.5">
                {pageEpisodes.map((episode) => {
                  const isCurrent = current?.id === episode.id
                  const isLocked = !episode.isFree && !episode.isUnlocked
                  return (
                    <button
                      key={episode.id}
                      type="button"
                      onClick={() => openEpisode(episode)}
                      title={episode.title}
                      className={`relative grid h-12 place-items-center rounded-lg text-sm font-semibold transition ${
                        isCurrent
                          ? "bg-primary/20 text-primary ring-1 ring-primary"
                          : "bg-white/[0.05] text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {openingId === episode.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : episode.episodeNumber}
                      {isLocked && (
                        <Lock className="absolute right-1 top-1 h-3 w-3 text-white/35" />
                      )}
                    </button>
                  )
                })}
              </div>

              {episodes.length === 0 && (
                <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center text-sm text-white/45">
                  No episodes published yet.
                </p>
              )}
            </div>

            {current && (
              <p className="mt-4 text-xs text-white/35">
                {formatEpisodeDuration(current.durationSeconds)}
                {current.isFree ? " · Free episode" : current.isUnlocked ? " · Unlocked" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      <CreditPackModal
        open={showPacks}
        onClose={() => setShowPacks(false)}
        balance={credits}
        onPurchased={(balance) => { setCredits(balance); setShowPacks(false) }}
        episodePrice={episodePrice}
      />
    </main>
  )
}
