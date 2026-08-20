import { createClient } from "@/lib/supabase/client"
import { QUICK_MEDIA_FOLDER, MEDIA_BUCKET } from "@/lib/studio/quick-media"

/**
 * Puts a reference file where the standalone routes can read it.
 *
 * Uploaded straight from the browser rather than posted through an API route:
 * a start frame is a few megabytes, and routing it through a serverless
 * function only to hand it back to storage doubles the transfer and puts the
 * file against the function's body limit for no benefit. Storage RLS is the
 * same check either way — the first path segment must be the caller.
 */
export async function uploadQuickReference(file: File): Promise<string> {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error("Please sign in to upload a reference.")

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60)
  const path = `${user.id}/${QUICK_MEDIA_FOLDER}/ref-${crypto.randomUUID()}-${safeName}`
  const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  return path
}

export const MAX_REFERENCE_BYTES = 25 * 1024 * 1024

/** Rejects a file the provider or the bucket would refuse, before it uploads. */
export function referenceRejection(file: File, kind: "image" | "video"): string | null {
  const isImage = file.type.startsWith("image/")
  const isVideo = file.type.startsWith("video/")
  if (kind === "image" && !isImage) return `${file.name} is not an image.`
  if (kind === "video" && !isVideo) return `${file.name} is not a video.`
  if (file.size > MAX_REFERENCE_BYTES) return `${file.name} is larger than 25 MB.`
  return null
}
