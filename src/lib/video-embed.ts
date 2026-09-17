/**
 * Links that are pages, not media files.
 *
 * A showcase row, a gig promo or a lesson can hold a YouTube link instead of an
 * uploaded file. `<video src>` can only play actual media, so such a row
 * rendered as a black rectangle — the tile loaded, the poster was missing and
 * nothing ever played. Everything needed to render one of those links properly
 * lives here, in one place, because the same question is asked by the homepage
 * reel, the hero and the lightbox.
 */

/** The id inside a watch, share, embed, live or Shorts URL — null for a file. */
export function youtubeVideoId(url: string): string | null {
  if (!url) return null
  const found = url.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/)([A-Za-z0-9_-]{6,})/,
  )
  return found ? found[1] : null
}

type EmbedOptions = {
  /** Start playing on load. Only honoured by the browser alongside `muted`. */
  autoplay?: boolean
  muted?: boolean
  /** Loops by naming the video as its own single-entry playlist, as YouTube requires. */
  loop?: boolean
  /** Player chrome. Off for a silent tile, on once someone has asked to watch. */
  controls?: boolean
}

/**
 * Turns a YouTube link into an embeddable one, or returns null for a file URL —
 * which keeps the normal `<video>` element in use for uploads.
 *
 * The standard domain, not youtube-nocookie: the privacy-enhanced host refuses
 * some videos — Shorts especially — that youtube.com serves fine.
 */
export function youtubeEmbedUrl(url: string, options: EmbedOptions = {}): string | null {
  const id = youtubeVideoId(url)
  if (!id) return null

  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" })
  const start = url.match(/[?&](?:t|start)=(\d+)/)
  if (start) params.set("start", start[1])
  if (options.autoplay) params.set("autoplay", "1")
  if (options.muted) params.set("mute", "1")
  if (options.controls === false) params.set("controls", "0")
  if (options.loop) {
    params.set("loop", "1")
    // A loop of one needs the playlist naming itself; without it YouTube stops
    // on the end card.
    params.set("playlist", id)
  }

  return `https://www.youtube.com/embed/${id}?${params.toString()}`
}

/**
 * The still frame YouTube already hosts for a video.
 *
 * A showcase row pointing at YouTube usually has no uploaded thumbnail, and a
 * tile with neither a poster nor a playing player is the black box this whole
 * file exists to stop. `oardefault` is the frame in the video's own shape — a
 * full 1080x1920 for a Short, where `hqdefault` would be that same frame
 * shrunk into the middle of a 4:3 box with black down both sides. It is not
 * generated for every video, so anything using it needs the fallback below on
 * error.
 */
export function youtubeThumbnailUrl(url: string): string | null {
  const id = youtubeVideoId(url)
  return id ? `https://i.ytimg.com/vi/${id}/oardefault.jpg` : null
}

/** The thumbnail every video has, for when the original-shape one is missing. */
export function youtubeFallbackThumbnailUrl(url: string): string | null {
  const id = youtubeVideoId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/** A Short is shot vertically, so the frame that holds it should be too. */
export function isVerticalVideo(url: string): boolean {
  return /youtube\.com\/shorts\//i.test(url || "")
}
