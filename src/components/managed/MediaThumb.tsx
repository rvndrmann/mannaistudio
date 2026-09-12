"use client"

import { useEffect, useState } from "react"
import { getSignedMediaUrl } from "@/lib/studio/signed-media"

/**
 * Resolves a storage path to a signed URL.
 *
 * Wraps `getSignedMediaUrl`, which batches everything asked for in the same
 * tick into one `createSignedUrls` call — a deliverables grid with eight
 * versions signs once rather than eight times.
 */
export function useSignedMedia(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    // Resolved through the promise even for the empty case, so the effect never
    // sets state synchronously in its own body — a cascading render per tile is
    // exactly what a grid of these does not need.
    Promise.resolve(path ? getSignedMediaUrl(path) : null)
      .then((signed) => { if (active) setUrl(signed) })
      .catch(() => undefined)
    return () => { active = false }
  }, [path])

  return url
}

/**
 * A video's own first frame as its poster.
 *
 * There is no separate thumbnail for a published cut, and asking the producer
 * to upload one is a step that would get skipped. `#t=0.1` with
 * `preload="metadata"` makes the browser fetch enough to paint a frame and no
 * more, which is the same trick the portfolio and profile pages use.
 */
export default function MediaThumb({
  path, className, alt,
}: { path: string | null | undefined; className?: string; alt?: string }) {
  const url = useSignedMedia(path)
  const isImage = Boolean(path && /\.(png|jpe?g|webp|gif|avif)$/i.test(path))

  if (!url) return <div className={`animate-pulse bg-white/[0.06] ${className || ""}`} aria-hidden />
  if (isImage) return <img src={url} alt={alt || ""} className={className} />
  return (
    <video
      src={`${url}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      className={className}
      aria-label={alt}
    />
  )
}
