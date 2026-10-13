import { randomUUID } from "node:crypto"
import type { AuthenticatedProjectContext } from "./server-context"

/**
 * Putting a user's own file into a project.
 *
 * Shared by the studio's upload route and by the MCP import, so a file that
 * arrives as a link from an assistant is stored, named and announced in the
 * chat exactly as one dropped onto the page is.
 */

export const uploadMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]

export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024

export class UploadError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "UploadError" }
}

export function mediaKind(contentType: string) {
  if (contentType.startsWith("image/")) return "image"
  if (contentType.startsWith("video/")) return "video"
  if (contentType.startsWith("audio/")) return "audio"
  return "file"
}

function extensionFor(name: string, contentType: string) {
  const fromName = name.includes(".") ? name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : ""
  if (fromName) return fromName
  if (contentType.includes("jpeg")) return "jpg"
  if (contentType.includes("png")) return "png"
  if (contentType.includes("webp")) return "webp"
  if (contentType.includes("gif")) return "gif"
  if (contentType.includes("quicktime")) return "mov"
  if (contentType.includes("mp4")) return "mp4"
  if (contentType.includes("webm")) return "webm"
  if (contentType.includes("wav")) return "wav"
  if (contentType.includes("ogg")) return "ogg"
  if (contentType.includes("mpeg")) return "mp3"
  return "bin"
}

export async function storeDirectorUpload(context: AuthenticatedProjectContext, input: { episodeId: string; sessionId?: string; name: string; contentType: string; body: Blob }) {
  const projectId = String(context.project.id)
  if (!uploadMediaTypes.includes(input.contentType)) throw new UploadError("Unsupported file type", 400)
  if (input.body.size > UPLOAD_MAX_BYTES) throw new UploadError("File is too large. Maximum size is 100MB.", 413)

  const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", projectId).maybeSingle()
  if (!episode) throw new UploadError("Episode not found", 404)

  let targetSessionId = input.sessionId || ""
  if (targetSessionId) {
    const { data: session } = await context.supabase.from("creator_chat_sessions").select("id").eq("id", targetSessionId).eq("episode_id", input.episodeId).eq("user_id", context.user.id).maybeSingle()
    if (!session) targetSessionId = ""
  }
  if (!targetSessionId) {
    const { data: existingSession } = await context.supabase.from("creator_chat_sessions").select("id").eq("episode_id", input.episodeId).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    targetSessionId = existingSession?.id || ""
  }
  if (!targetSessionId) {
    const { data, error } = await context.supabase.from("creator_chat_sessions").insert({ episode_id: input.episodeId, user_id: context.user.id, title: "AI Director" }).select("id").single()
    if (error) throw error
    targetSessionId = data.id
  }

  const kind = mediaKind(input.contentType)
  const path = `${context.user.id}/${projectId}/chat/${kind}-${randomUUID()}.${extensionFor(input.name, input.contentType)}`
  const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(path, input.body, { contentType: input.contentType, upsert: false })
  if (uploadError) throw uploadError
  const { data: signed } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
  const media = {
    type: kind,
    path,
    url: signed?.signedUrl || "",
    name: input.name,
    contentType: input.contentType,
    size: input.body.size,
    source: "chat_upload",
    usage: "available_to_ai_director_for_assets_storyboard_and_generation_reference",
  }
  const { data: message, error: messageError } = await context.supabase.from("creator_chat_messages").insert({
    session_id: targetSessionId,
    role: "user",
    content: `Uploaded ${kind}: ${input.name}`,
    media: [media],
  }).select().single()
  if (messageError) throw messageError
  return { sessionId: targetSessionId, message, media }
}
