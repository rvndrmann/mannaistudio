import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"

const allowedTypes = [
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

function mediaKind(contentType: string) {
  if (contentType.startsWith("image/")) return "image"
  if (contentType.startsWith("video/")) return "video"
  if (contentType.startsWith("audio/")) return "audio"
  return "file"
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (fromName) return fromName
  if (file.type.includes("jpeg")) return "jpg"
  if (file.type.includes("png")) return "png"
  if (file.type.includes("webp")) return "webp"
  if (file.type.includes("mp4")) return "mp4"
  if (file.type.includes("webm")) return "webm"
  if (file.type.includes("wav")) return "wav"
  if (file.type.includes("mpeg")) return "mp3"
  return "bin"
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const form = await request.formData()
    const episodeId = String(form.get("episodeId") || "")
    const sessionId = String(form.get("sessionId") || "")
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: "File is too large. Maximum size is 100MB." }, { status: 413 })

    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", episodeId).eq("project_id", projectId).maybeSingle()
    if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })

    let targetSessionId = sessionId
    if (targetSessionId) {
      const { data: session } = await context.supabase.from("creator_chat_sessions").select("id").eq("id", targetSessionId).eq("episode_id", episodeId).eq("user_id", context.user.id).maybeSingle()
      if (!session) targetSessionId = ""
    }
    if (!targetSessionId) {
      const { data: existingSession } = await context.supabase.from("creator_chat_sessions").select("id").eq("episode_id", episodeId).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      targetSessionId = existingSession?.id || ""
    }
    if (!targetSessionId) {
      const { data, error } = await context.supabase.from("creator_chat_sessions").insert({ episode_id: episodeId, user_id: context.user.id, title: "AI Director" }).select("id").single()
      if (error) throw error
      targetSessionId = data.id
    }

    const kind = mediaKind(file.type)
    const path = `${context.user.id}/${projectId}/chat/${kind}-${randomUUID()}.${extensionFor(file)}`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { data: signed } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    const media = {
      type: kind,
      path,
      url: signed?.signedUrl || "",
      name: file.name,
      contentType: file.type,
      size: file.size,
      source: "chat_upload",
      usage: "available_to_ai_director_for_assets_storyboard_and_generation_reference",
    }
    const { data: message, error: messageError } = await context.supabase.from("creator_chat_messages").insert({
      session_id: targetSessionId,
      role: "user",
      content: `Uploaded ${kind}: ${file.name}`,
      media: [media],
    }).select().single()
    if (messageError) throw messageError
    return NextResponse.json({ sessionId: targetSessionId, message, media })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: studioErrorStatus(error) })
  }
}

