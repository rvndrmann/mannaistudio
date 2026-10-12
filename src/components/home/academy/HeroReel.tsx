"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"

export type HeroClip = { id: string; title: string; label: string; video: string; poster: string }

/**
 * The hero's reel: featured work, playing silently in turn.
 *
 * The first frame a visitor sees is the poster, which is in the HTML. The video
 * itself is not asked for until the page has finished loading and settled — these are
 * full-resolution ad files, and fetching one ahead of the headline's own
 * stylesheet is how a landing page loses its first second on a phone.
 *
 * No native controls: a scrubber and a kebab menu on the first thing on the
 * page read as a broken embed. The one control is sound, off until asked.
 */
export default function HeroReel({ clips }: { clips: HeroClip[] }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [index, setIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const [playingId, setPlayingId] = useState("")
  const clip = clips[index % clips.length]

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // After load, and then only when the browser has nothing better to do:
    // the page's own scripts and the poster come first.
    let idle = 0
    const start = () => { idle = window.setTimeout(() => setReady(true), 1200) }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
    return () => { window.removeEventListener("load", start); window.clearTimeout(idle) }
  }, [])

  // Plays while on screen and stops when scrolled past: a reel nobody is
  // looking at is a download nobody asked for.
  useEffect(() => {
    const video = ref.current
    if (!video || !ready) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {})
      else video.pause()
    }, { threshold: 0.25 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [ready, index])

  if (!clip) return null

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-[#0d0f0e] shadow-2xl shadow-black/60 lg:max-w-none">
      {/* The same frame, blurred, behind a clip that does not fill the box —
          so a landscape piece sits on its own colours instead of black bars. */}
      <img src={clip.poster} alt="" aria-hidden fetchPriority="high" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      {/* The poster is an image of its own rather than the video's `poster`,
          so it is fetched once, first, and is what the page is measured by;
          the video is laid over it and shown when it has a frame to show. */}
      <img src={clip.poster} alt={clip.title} fetchPriority="high" decoding="async" className="relative h-full w-full object-contain" />
      <video
        key={clip.id}
        ref={ref}
        src={ready ? clip.video : undefined}
        muted={muted}
        playsInline
        loop={clips.length === 1}
        preload="none"
        onPlaying={() => setPlayingId(clip.id)}
        onEnded={() => setIndex((current) => (current + 1) % clips.length)}
        aria-label={clip.title}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${playingId === clip.id ? "opacity-100" : "opacity-0"}`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-5 pb-4 pt-12">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">{clip.label}</p>
        <p className="mt-1 text-base font-semibold">{clip.title}</p>
      </div>
      <button
        type="button"
        aria-label={muted ? "Unmute video" : "Mute video"}
        onClick={() => setMuted((current) => !current)}
        className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/80"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {clips.length > 1 && (
        <div className="absolute left-4 top-4 flex gap-1.5" aria-hidden>
          {clips.map((item, position) => (
            <span key={item.id} className={`h-1 w-6 rounded-full ${position === index ? "bg-primary" : "bg-white/30"}`} />
          ))}
        </div>
      )}
    </div>
  )
}
