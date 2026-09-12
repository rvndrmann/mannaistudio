"use client"

import { createClient } from "@/lib/supabase/client"
import { MANAGED_MEDIA_BUCKET, managedUploadPrefix } from "@/lib/managed-production"
import type { ManagedAttachment } from "@/lib/managed-brief"

/**
 * Client uploads: brief assets, chat attachments, revision references.
 *
 * Straight from the browser rather than posted through an API route, the same
 * way `uploadQuickReference` does it — a product video is tens of megabytes and
 * routing it through a serverless function only to hand it back to storage
 * doubles the transfer and puts the file against the function's body limit for
 * no benefit. Storage RLS is the same check either way.
 *
 * Two destinations, because a brief is filled in before the project it belongs
 * to exists:
 *
 *   before checkout — `{userId}/managed-briefs/…`, covered by the bucket's
 *   owner-prefix policy. The checkout route copies these into the project's
 *   client folder once it has an id, which is what makes them readable by the
 *   producing team.
 *
 *   after checkout — `managed/{projectId}/uploads/…` directly, which both the
 *   client and the team can read.
 */

export const MAX_MANAGED_UPLOAD_BYTES = 200 * 1024 * 1024

const ALLOWED_PREFIXES = ["image/", "video/"]
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]

export const BRIEF_UPLOAD_FOLDER = "managed-briefs"

/** Names why a file will not be accepted, or null when it is fine. */
export function uploadRejection(file: File): string | null {
  const allowed = ALLOWED_PREFIXES.some((prefix) => file.type.startsWith(prefix)) || ALLOWED_TYPES.includes(file.type)
  if (!allowed) return `${file.name} is not an image, video, or document.`
  if (file.size > MAX_MANAGED_UPLOAD_BYTES) return `${file.name} is larger than 200 MB.`
  return null
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60) || "file"
}

async function put(path: string, file: File): Promise<ManagedAttachment> {
  const client = createClient()
  const { error } = await client.storage
    .from(MANAGED_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw new Error(error.message)
  return { path, name: file.name, contentType: file.type || "", kind: "attachment" }
}

/** Uploads a brief asset before the project exists. */
export async function uploadBriefAsset(file: File, kind: ManagedAttachment["kind"]): Promise<ManagedAttachment> {
  const rejection = uploadRejection(file)
  if (rejection) throw new Error(rejection)

  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error("Sign in to attach files to your brief.")

  const attachment = await put(
    `${user.id}/${BRIEF_UPLOAD_FOLDER}/${crypto.randomUUID()}-${safeName(file.name)}`,
    file,
  )
  return { ...attachment, kind }
}

/** Uploads into a project that already exists — chat and revision attachments. */
export async function uploadProjectAsset(projectId: string, file: File): Promise<ManagedAttachment> {
  const rejection = uploadRejection(file)
  if (rejection) throw new Error(rejection)

  return put(`${managedUploadPrefix(projectId)}/${crypto.randomUUID()}-${safeName(file.name)}`, file)
}
