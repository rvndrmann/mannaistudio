import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  await supabase.from("profiles").upsert({ id: user.id, full_name: user.user_metadata?.full_name || "Creator", avatar_url: user.user_metadata?.avatar_url || "", email: user.email || "" }, { onConflict: "id" })
  return { supabase, user }
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser()
    const { data, error } = await supabase.from("creator_projects").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load bases" }, { status: 401 }) }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser(); const body = await request.json()
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const { data: project, error } = await supabase.from("creator_projects").insert({ user_id: user.id, name: body.name.trim(), description: body.description || null, cover_image: body.cover_image || null }).select().single()
    if (error) throw error
    const { data: episode, error: episodeError } = await supabase.from("creator_episodes").insert({ project_id: project.id, name: "Episode 1", description: `First episode of ${project.name}`, status: "in_progress" }).select().single()
    if (episodeError) throw episodeError
    const { data: session, error: sessionError } = await supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: user.id, title: "New Chat" }).select().single()
    if (sessionError) throw sessionError
    return NextResponse.json({ project, episodeId: episode.id, sessionId: session.id })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create base" }, { status: 400 }) }
}

