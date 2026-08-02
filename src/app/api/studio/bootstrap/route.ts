import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    await supabase.from("profiles").upsert({ id: user.id, full_name: user.user_metadata?.full_name || "Creator", avatar_url: user.user_metadata?.avatar_url || "", email: user.email || "" }, { onConflict: "id" })
    let { data: project } = await supabase.from("creator_projects").select("*").eq("user_id", user.id).order("created_at").limit(1).maybeSingle()
    if (!project) { const { data, error } = await supabase.from("creator_projects").insert({ user_id: user.id, name: "My first base", description: "Your AI video production workspace" }).select().single(); if (error) throw error; project = data }
    let { data: episode } = await supabase.from("creator_episodes").select("*").eq("project_id", project.id).order("order_index").limit(1).maybeSingle()
    if (!episode) { const { data, error } = await supabase.from("creator_episodes").insert({ project_id: project.id, name: "Episode 1", status: "in_progress" }).select().single(); if (error) throw error; episode = data }
    let { data: session } = await supabase.from("creator_chat_sessions").select("*").eq("episode_id", episode.id).eq("user_id", user.id).limit(1).maybeSingle()
    if (!session) { const { data, error } = await supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: user.id, title: "New Chat" }).select().single(); if (error) throw error; session = data }
    return NextResponse.json({ ok: true, userId: user.id, projectId: project.id, episodeId: episode.id, sessionId: session.id })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Bootstrap failed" }, { status: 500 }) }
}

