import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Browser-side media handling for the Proof manager.
 *
 * Everything an admin uploads as an image is re-encoded to WebP at a bounded
 * size before it leaves their machine. A phone screenshot of a payment is
 * routinely 3–5 MB; the homepage shows it at 64 pixels and in a lightbox, and
 * a visitor on mobile data should be downloading neither of those as a PNG.
 */

const BUCKET = "showcase-videos"

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file could not be read as an image.")) }
    image.src = url
  })
}

function drawToWebp(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext("2d")
  if (!context) return Promise.reject(new Error("This browser cannot process images."))
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not compress the image."))), "image/webp", quality)
  })
}

/** Re-encodes an image as WebP, no larger than `maxSide` on its longest edge. */
export async function compressImage(file: Blob, maxSide: number, quality = 0.82): Promise<Blob> {
  const image = await loadImage(file)
  return drawToWebp(image, image.naturalWidth, image.naturalHeight, maxSide, quality)
}

/**
 * A poster from a video's opening frame.
 *
 * Half a second in rather than the very first frame, which is black on anything
 * that fades in. `source` is a local file or a URL; a URL only works if its
 * host allows cross-origin reads, which the site's own storage does and
 * YouTube does not.
 */
export function posterFromVideo(source: File | string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    const url = typeof source === "string" ? source : URL.createObjectURL(source)
    const done = () => { if (typeof source !== "string") URL.revokeObjectURL(url) }
    const timeout = setTimeout(() => { done(); reject(new Error("The video took too long to load a frame from.")) }, 20000)
    video.crossOrigin = "anonymous"
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 2) }
    video.onseeked = () => {
      clearTimeout(timeout)
      drawToWebp(video, video.videoWidth, video.videoHeight, 1280, 0.8).then(resolve, reject).finally(done)
    }
    video.onerror = () => { clearTimeout(timeout); done(); reject(new Error("A frame could not be read from that video.")) }
    video.src = url
  })
}

export async function uploadProofBlob(supabase: SupabaseClient, blob: Blob, folder: string, extension: string): Promise<string> {
  const path = `proof/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || undefined, cacheControl: "31536000" })
  if (error) throw new Error(error.message)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Full size for the lightbox, a small one for the card. */
export async function uploadScreenshot(supabase: SupabaseClient, file: File): Promise<{ url: string; thumb: string }> {
  const [full, thumb] = await Promise.all([compressImage(file, 1600), compressImage(file, 320, 0.75)])
  const [url, thumbUrl] = await Promise.all([
    uploadProofBlob(supabase, full, "screenshots", "webp"),
    uploadProofBlob(supabase, thumb, "screenshots/thumbs", "webp"),
  ])
  return { url, thumb: thumbUrl }
}
