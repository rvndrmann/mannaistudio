/**
 * A stored path that holds a clip rather than a frame.
 *
 * Kept deliberately simple: it reads the extension, because these are paths in
 * this project's own bucket, written by this project's own uploads and renders.
 *
 * Shared between the server, which uses it to keep a clip out of the image
 * reference list before the provider ever rejects it, and the client, which
 * uses it to route an uploaded file into the composition strip or the motion
 * reference strip as it is actually being dropped — a video dropped where
 * images go was the same mistake in the other direction.
 */
export function isVideoReferencePath(path: string) {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|#|$)/i.test(path)
}
