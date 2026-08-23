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
 * The images a turn actually needs to carry.
 *
 * This used to attach up to four storyboard keyframes on every single turn,
 * whether or not the message had anything to do with looking at them. Measured,
 * one "how many shots does this episode have?" carried 8.65 MB of PNGs: 7.2s
 * spent downloading and encoding them, then 25.3s uploading an 11.54 MB request
 * that produced 47 tokens of reply. The pictures were ~99% of the bytes and
 * roughly 32 of those 36 seconds, for a question that never needed to see one.
 *
 * Worse, the loop re-sends its whole item list on every step, so a turn that
 * called two tools uploaded all of it three times.
 *
 * So images now travel only when something in the turn actually points at one:
 * the user @mentioned an entity, or they attached media to this message. When
 * the Director decides mid-turn that it needs to see something else, it asks
 * for it with look_at_media and gets exactly what it asked for — a decision the
 * model makes, rather than a guess made from the words in the sentence.
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

  // The user pointed at these entities in this message.
  for (const entity of input.mentionedEntities || []) {
    const first = entityPrimaryReference(entity)
    if (first) candidates.push({ label: `reference art for @${entity.name}`, path: first })
  }

  // What the user has attached since the Director last spoke — this turn's
  // uploads. Reading the last eight messages regardless, as this did before,
  // re-sent images from earlier turns that nobody was asking about any more.
  if (input.sessionId) {
    const { data: messages } = await input.supabase
      .from("creator_chat_messages")
      .select("media,created_at,role")
      .eq("session_id", input.sessionId)
      .order("created_at", { ascending: false })
      .limit(12)

    for (const message of messages || []) {
      if (message.role === "assistant") break
      const media = Array.isArray(message.media) ? message.media : []
      for (const item of media) {
        const value = item as Record<string, unknown>
        const path = typeof value.path === "string" ? value.path : ""
        if (!path) continue
        const type = typeof value.type === "string" ? value.type : "file"
        if (type !== "image" && !looksLikeImage(path)) continue
        candidates.push({ label: "image the user just attached", path })
      }
    }
  }

  return inlineAttachments(input.supabase, candidates, limit)
}

/**
 * The media the Director explicitly asked to look at, by shot number or entity
 * name. Nothing here is inferred: the model named what it wants to see.
 */
export async function collectRequestedMedia(input: {
  supabase: SupabaseClient
  projectId: string
  episodeId?: string
  shotNumbers?: number[]
  entityNames?: string[]
  limit?: number
}): Promise<DirectorVisionAttachment[]> {
  const candidates: Array<{ label: string; path: string }> = []
  const shotNumbers = (input.shotNumbers || []).filter((number) => Number.isInteger(number) && number > 0)

  if (shotNumbers.length && input.episodeId) {
    const { data: shots } = await input.supabase
      .from("creator_shots")
      .select("order_index,keyframe_image")
      .eq("episode_id", input.episodeId)
      .in("order_index", shotNumbers.map((number) => number - 1))
    for (const shot of shots || []) {
      if (typeof shot.keyframe_image === "string" && shot.keyframe_image.trim()) {
        candidates.push({ label: `current keyframe for shot ${Number(shot.order_index) + 1}`, path: shot.keyframe_image })
      }
    }
  }

  const entityNames = (input.entityNames || []).map((name) => name.replace(/^@/, "").trim().toLowerCase()).filter(Boolean)
  if (entityNames.length) {
    const { data: entities } = await input.supabase
      .from("creator_entities")
      .select("id,name,type,reference_images,metadata")
      .eq("project_id", input.projectId)
    for (const entity of entities || []) {
      if (!entityNames.includes(String(entity.name || "").trim().toLowerCase())) continue
      const first = entityPrimaryReference(entity as MentionableEntity)
      if (first) candidates.push({ label: `reference art for @${entity.name}`, path: first })
    }
  }

  return inlineAttachments(input.supabase, candidates, input.limit ?? 6)
}

/** Signs, reads, and budgets a candidate list. Shared by both collectors. */
async function inlineAttachments(
  supabase: SupabaseClient,
  candidates: Array<{ label: string; path: string }>,
  limit: number,
): Promise<DirectorVisionAttachment[]> {
  // Deduplicated and cut to the limit before anything is fetched, so the work
  // below is only ever done for images that can actually be sent.
  const seen = new Set<string>()
  const wanted = candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false
    seen.add(candidate.path)
    // BytePlus asset identities are not fetchable images; skip rather than fail.
    return !/^asset:\/\//i.test(candidate.path)
  }).slice(0, limit)
  if (!wanted.length) return []

  // Signed one batch at a time, then read one batch at a time.
  //
  // These were a sequential loop: sign, fetch, base64, then the next one. Six
  // storage round trips and six multi-megabyte downloads end to end, each with
  // an eight-second timeout, all of it before the first token of the reply
  // could be asked for. Nothing about one attachment depends on another.
  const signed = await Promise.all(wanted.map(async (candidate) => {
    if (/^https?:\/\//i.test(candidate.path)) return { label: candidate.label, url: candidate.path }
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(candidate.path, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) return null
    return { label: candidate.label, url: data.signedUrl }
  }))

  // Each image is capped on its own here; the shared budget is applied below,
  // in order, so which images survive it does not depend on who finished first.
  const inlined = await Promise.all(signed.map(async (item) => {
    if (!item) return null
    // An image that cannot be read in time is left out. Sending its URL instead
    // would only move the same timeout to the provider, where it fails the whole
    // run rather than one attachment.
    const image = await inlineImage(item.url, MAX_ATTACHMENT_BYTES)
    return image ? { label: item.label, image } : null
  }))

  const attachments: DirectorVisionAttachment[] = []
  let totalBytes = 0
  for (const item of inlined) {
    if (!item) continue
    if (totalBytes + item.image.bytes > MAX_TOTAL_ATTACHMENT_BYTES) continue
    totalBytes += item.image.bytes
    attachments.push({ label: item.label, url: item.image.dataUrl })
  }

  return attachments
}

/** Reads an image and returns it as a data URL, or null if it cannot be used. */
export async function inlineImage(url: string, remainingBudget: number): Promise<{ dataUrl: string; bytes: number } | null> {
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
