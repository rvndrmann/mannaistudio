import type { SupabaseClient } from "@supabase/supabase-js"
import { entityPrimaryReference, type MentionableEntity } from "./entity-mentions"

const MEDIA_BUCKET = "creator-studio-media"
const SIGNED_URL_TTL_SECONDS = 60 * 60

// The model provider fetches a remote image itself and gives up quickly:
// "Unable to download content from the provided URL before the timeout". A
// storyboard keyframe is a multi-megabyte PNG and six of them are attached at
// once, so that request failed on storage latency rather than on anything the
// user did. Reading the bytes here and sending them inline takes the provider's
// network out of the path entirely.
const ATTACHMENT_FETCH_TIMEOUT_MS = 8_000
// Beyond this an inline image costs more in upload time than it returns in
// context, so the attachment is dropped rather than sent.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024

export type DirectorVisionAttachment = {
  /** Short human-readable origin, shown to the model beside the image. */
  label: string
  url: string
}

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif)$/i

function looksLikeImage(path: string) {
  return IMAGE_EXTENSION.test(path.split("?")[0])
}

/**
 * Storage paths mean nothing to a model that cannot open them. These are
 * resolved to signed URLs so the Director can actually look at the references it
 * is reasoning about: what the user uploaded, the art already approved for a
 * mentioned character, and the frames it produced earlier in the session.
 */
export async function collectDirectorVisionAttachments(input: {
  supabase: SupabaseClient
  projectId: string
  sessionId?: string
  episodeId?: string
  mentionedEntities?: MentionableEntity[]
  limit?: number
}): Promise<DirectorVisionAttachment[]> {
  const limit = input.limit ?? 6
  const candidates: Array<{ label: string; path: string }> = []

  // Highest value first: the user pointed at these entities in this message.
  for (const entity of input.mentionedEntities || []) {
    const first = entityPrimaryReference(entity)
    if (first) candidates.push({ label: `reference art for @${entity.name}`, path: first })
  }

  if (input.sessionId) {
    const { data: messages } = await input.supabase
      .from("creator_chat_messages")
      .select("media,created_at,role")
      .eq("session_id", input.sessionId)
      .not("media", "is", null)
      .order("created_at", { ascending: false })
      .limit(8)

    for (const message of messages || []) {
      const media = Array.isArray(message.media) ? message.media : []
      for (const item of media) {
        const value = item as Record<string, unknown>
        const path = typeof value.path === "string" ? value.path : ""
        if (!path) continue
        const type = typeof value.type === "string" ? value.type : "file"
        if (type !== "image" && !looksLikeImage(path)) continue
        candidates.push({
          label: message.role === "assistant" ? "image you generated earlier in this chat" : "image the user uploaded",
          path,
        })
      }
    }
  }

  if (input.episodeId) {
    const { data: shots } = await input.supabase
      .from("creator_shots")
      .select("order_index,keyframe_image")
      .eq("episode_id", input.episodeId)
      .not("keyframe_image", "is", null)
      .order("order_index")
      .limit(4)
    for (const shot of shots || []) {
      if (typeof shot.keyframe_image === "string" && shot.keyframe_image.trim()) {
        candidates.push({ label: `current keyframe for shot ${Number(shot.order_index) + 1}`, path: shot.keyframe_image })
      }
    }
  }

  const seen = new Set<string>()
  const attachments: DirectorVisionAttachment[] = []
  let totalBytes = 0
  for (const candidate of candidates) {
    if (attachments.length >= limit) break
    if (seen.has(candidate.path)) continue
    seen.add(candidate.path)

    // BytePlus asset identities are not fetchable images; skip rather than fail.
    if (/^asset:\/\//i.test(candidate.path)) continue

    let url = candidate.path
    if (!/^https?:\/\//i.test(candidate.path)) {
      const { data, error } = await input.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(candidate.path, SIGNED_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) continue
      url = data.signedUrl
    }

    const inlined = await inlineImage(url, MAX_TOTAL_ATTACHMENT_BYTES - totalBytes)
    // An image that cannot be read in time is left out. Sending its URL instead
    // would only move the same timeout to the provider, where it fails the whole
    // run rather than one attachment.
    if (!inlined) continue
    totalBytes += inlined.bytes
    attachments.push({ label: candidate.label, url: inlined.dataUrl })
  }

  return attachments
}

/** Reads an image and returns it as a data URL, or null if it cannot be used. */
async function inlineImage(url: string, remainingBudget: number): Promise<{ dataUrl: string; bytes: number } | null> {
  if (remainingBudget <= 0) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ATTACHMENT_FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared && declared > Math.min(MAX_ATTACHMENT_BYTES, remainingBudget)) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.byteLength || buffer.byteLength > Math.min(MAX_ATTACHMENT_BYTES, remainingBudget)) return null
    const contentType = (response.headers.get("content-type") || "image/png").split(";")[0].trim()
    if (!contentType.startsWith("image/")) return null
    return { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, bytes: buffer.byteLength }
  } catch {
    // A slow or unreachable reference must not fail the Director run.
    return null
  }
}

export type DirectorContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }

/**
 * Builds the user turn as multimodal content. The label precedes each image so
 * the model can tell an uploaded reference from something it made itself.
 */
export function buildVisionUserContent(text: string, attachments: DirectorVisionAttachment[]): string | DirectorContentPart[] {
  if (!attachments.length) return text
  const parts: DirectorContentPart[] = [{ type: "input_text", text }]
  parts.push({
    type: "input_text",
    text: `You can see ${attachments.length} image${attachments.length === 1 ? "" : "s"} from this workspace. Use what is actually visible in them rather than assuming.`,
  })
  for (const attachment of attachments) {
    parts.push({ type: "input_text", text: `Image: ${attachment.label}` })
    parts.push({ type: "input_image", image_url: attachment.url })
  }
  return parts
}
