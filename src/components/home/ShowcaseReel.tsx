"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Play, X } from "lucide-react"
import {
  availableShowcaseFilters,
  showcaseCategoryLabel,
  type ShowcaseVideo,
} from "@/lib/showcase"
import {
  isVerticalVideo,
  youtubeEmbedUrl,
  youtubeFallbackThumbnailUrl,
  youtubeThumbnailUrl,
} from "@/lib/video-embed"

/**
 * The work, playing.
 *
 * A grid of the admin's chosen ads. Three rules decide everything here:
 *
 *   Nothing loads until it is nearly on screen. Nine ad files at full
 *   resolution is a homepage that costs a phone its data allowance before the
 *   visitor has read the headline, and most of them will never be looked at.
 *
 *   Nothing is cropped. These are 9:16 ads; a tile that fills a landscape box
 *   shows the middle of one, which on a page selling video production is the
 *   worst possible advertisement.
 *
 *   Nothing has sound until asked. Muted autoplay is what the browsers allow
 *   inline anyway, and a grid that starts talking is a grid people close.
 *
 * A row may hold a YouTube link rather than an uploaded file; those play in an
 * embedded player under the same three rules.
 */
export default function ShowcaseReel({ videos }: { videos: ShowcaseVideo[] }) {
  const [filter, setFilter] = useState<string>("all")
  const [opened, setOpened] = useState<ShowcaseVideo | null>(null)
  const filters = useMemo(() => availableShowcaseFilters(videos), [videos])
  const shown = useMemo(
    () => (filter === "all" ? videos : videos.filter((video) => video.category === filter)),
    [videos, filter],
  )

  if (!videos.length) return null

  return (
    <div>
      {/* Only offered when there is something to filter: two categories across
          nine videos is a row of buttons that mostly empty the grid. */}
      {filters.length > 2 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {[{ key: "all", label: "All" }, ...filters].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${
                filter === option.key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-white/12 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {shown.map((video, index) => (
          <ReelTile key={video.id} video={video} index={index} onOpen={() => setOpened(video)} />
        ))}
      </div>

      {opened && <ReelLightbox video={opened} onClose={() => setOpened(null)} />}
    </div>
  )
}

/** Whether this visitor has asked their system for less motion. */
function prefersLessMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
}

/**
 * One ad in the grid.
 *
 * The file is not even referenced until the tile comes within a screen of the
 * viewport — `src` is empty before that, so the browser has nothing to fetch.
 * Once loaded it plays muted on screen and pauses off it, which keeps the
 * number of decoding videos to what is actually visible however far the
 * visitor scrolls.
 *
 * A row holding a YouTube link plays by a different rule: its still frame sits
 * in the tile, and the player is built only while the pointer is on it. Two
 * reasons, both learned the hard way — a browser will refuse to autoplay an
 * embedded player it was given no gesture for, and a refused one does not sit
 * there quietly, it sits there wearing YouTube's red button and branding on a
 * page selling this studio's own work. Hovering is the gesture, and a tap on a
 * phone opens the ad full size, which is where it was going anyway.
 */
function ReelTile({ video, index, onOpen }: { video: ShowcaseVideo; index: number; onOpen: () => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)
  // YouTube's frame in the video's own shape is not generated for every video,
  // and an admin's uploaded thumbnail can be deleted out from under a row, so a
  // poster that 404s drops to the one YouTube always has rather than to black.
  const [posterMissing, setPosterMissing] = useState(false)

  useEffect(() => {
    // Someone who has asked their system for less motion gets the poster and
    // the play button, not a wall of moving pictures.
    const stillness = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null

    const element = holder.current
    if (!element || typeof IntersectionObserver === "undefined") {
      // Nothing to tell us when this tile arrives, so load it and let the
      // browser's own lazy heuristics take it from there. Queued rather than
      // set in the effect body, which would cascade a second render.
      const id = window.setTimeout(() => setNear(true), 0)
      return () => window.clearTimeout(id)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true)
        const shouldPlay = entry.isIntersecting && entry.intersectionRatio > 0.5 && !stillness?.matches
        setPlaying(shouldPlay)
        const media = player.current
        if (!media) return
        if (shouldPlay) void media.play().catch(() => undefined)
        else media.pause()
      },
      // One screen of warning to load, half the tile showing to play.
      { rootMargin: "300px 0px", threshold: [0, 0.5] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const embedUrl = youtubeEmbedUrl(video.videoUrl, {
    autoplay: true,
    muted: true,
    loop: true,
    controls: false,
  })
  const preferredPoster = video.thumbnail || youtubeThumbnailUrl(video.videoUrl) || undefined
  const poster = (posterMissing ? youtubeFallbackThumbnailUrl(video.videoUrl) : preferredPoster) || undefined
  const vertical = isVerticalVideo(video.videoUrl)
  // Whether this tile is currently moving — a video playing in view, or a
  // hovered embed — which is the same question the play badge and the darkening
  // gradient both ask.
  const preview = embedUrl ? hovered : playing

  return (
    <div
      ref={holder}
      // The pointer arriving is the gesture the embedded player needs, and a
      // device with no pointer never sends it — which is the behaviour wanted
      // on a phone, where the tap opens the ad full size instead.
      onMouseEnter={() => setHovered(!prefersLessMotion())}
      onMouseLeave={() => setHovered(false)}
      className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-white/10 bg-black transition hover:border-primary/40"
    >
      {/* A blurred copy of the poster fills the sides of anything that is not
          9:16, so a landscape ad is letterboxed into something that looks
          composed rather than broken. */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setPosterMissing(true)}
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-2xl"
        />
      )}

      {embedUrl ? (
        <>
          {poster && (
            <img
              src={poster}
              alt={video.title}
              loading={index < 3 ? "eager" : "lazy"}
              onError={() => setPosterMissing(true)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          {preview && (
            // A Short fills the tile; anything else is a 16:9 player centred in
            // it, so the blurred backdrop shows through instead of the player's
            // own black bars.
            <div
              className={`absolute inset-x-0 ${
                vertical ? "inset-y-0" : "top-1/2 aspect-video -translate-y-1/2"
              }`}
            >
              <iframe
                src={embedUrl}
                title={video.title}
                // The click belongs to the tile, which opens the ad properly
                // sized and with sound; the silent preview must not swallow it.
                className="pointer-events-none h-full w-full"
                tabIndex={-1}
                aria-hidden="true"
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            </div>
          )}
          {preview && (
            // An embedded player wears its own title bar and a Watch-on-YouTube
            // button, neither of which can be turned off and both of which
            // belong to someone else's brand. Bands top and bottom bury them in
            // the same darkening this tile already does at its foot.
            <>
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/90 via-black/60 to-transparent" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
            </>
          )}
        </>
      ) : near && video.videoUrl ? (
        <video
          ref={player}
          src={video.videoUrl}
          poster={poster}
          muted
          loop
          playsInline
          // The element only exists once the tile is within a screen of the
          // viewport, so metadata is a first frame for the tiles someone is
          // actually about to see — and without it a poster-less ad is a black
          // rectangle until play() has buffered.
          preload="metadata"
          className="relative h-full w-full object-contain"
        />
      ) : poster ? (
        <img
          src={poster}
          alt={video.title}
          loading={index < 3 ? "eager" : "lazy"}
          className="relative h-full w-full object-contain"
        />
      ) : (
        <div className="relative h-full w-full" />
      )}

      <span
        className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent transition ${
          preview ? "opacity-90" : "opacity-100"
        }`}
      />

      {!preview && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/90 text-black shadow-lg transition group-hover:scale-105">
            <Play className="ml-0.5 h-5 w-5" />
          </span>
        </span>
      )}

      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
        {video.brand && (
          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-primary/90">
            {video.brand}
          </span>
        )}
        <span className="block truncate text-xs font-semibold text-white">{video.title}</span>
        <span className="mt-0.5 block text-[10px] text-white/45">{showcaseCategoryLabel(video.category)}</span>
      </span>

      {/* The whole tile is the button, laid over the media rather than wrapped
          around it: an embedded player is interactive content and cannot live
          inside a button without stealing its click. */}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="sr-only">{`Play ${video.title || "showcase ad"}`}</span>
      </button>
    </div>
  )
}

/** The ad at full size, with sound and controls, because now it was asked for. */
function ReelLightbox({ video, onClose }: { video: ShowcaseVideo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const embedUrl = youtubeEmbedUrl(video.videoUrl, { autoplay: true, controls: true })
  const vertical = isVerticalVideo(video.videoUrl)
  // A player cannot be told "as tall as the screen allows, and keep its shape"
  // in one rule, so the width is capped by the viewport height instead: 44vh of
  // width is 78vh of height at 9:16.
  const width = embedUrl && !vertical ? "max-w-[min(100%,900px)]" : "max-w-[min(100%,480px,44vh)]"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>
      <div className={`flex max-h-full w-full flex-col ${width}`} onClick={(event) => event.stopPropagation()}>
        {embedUrl ? (
          <div className={`w-full overflow-hidden rounded-xl bg-black ${vertical ? "aspect-[9/16]" : "aspect-video"}`}>
            <iframe
              src={embedUrl}
              title={video.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          <video
            src={video.videoUrl}
            poster={video.thumbnail || undefined}
            controls
            autoPlay
            playsInline
            className="max-h-[78vh] w-full rounded-xl bg-black object-contain"
          />
        )}
        <div className="mt-3 px-1">
          {video.brand && <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{video.brand}</p>}
          <p className="text-sm font-semibold text-white">{video.title}</p>
          {video.description && <p className="mt-1 text-xs leading-relaxed text-white/45">{video.description}</p>}
        </div>
      </div>
    </div>
  )
}
