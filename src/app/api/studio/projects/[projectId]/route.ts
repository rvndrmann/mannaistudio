import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function ownedProject(projectId: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Unauthorized")
  const { data: project, error } = await supabase.from("creator_projects").select("*").eq("id", projectId).eq("user_id", user.id).single(); if (error || !project) throw new Error("Project not found")
  return { supabase, user, project }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId } = await params; const { supabase, user, project } = await ownedProject(projectId)
    const { data: episodes } = await supabase.from("creator_episodes").select("*").eq("project_id", projectId).order("order_index")
    const activeEpisode = episodes?.[0]; if (!activeEpisode) return NextResponse.json({ error: "Project has no episodes" }, { status: 400 })
    const [{ data: entities }, { data: shots }, { data: chatSessions }] = await Promise.all([supabase.from("creator_entities").select("*").eq("project_id", projectId), supabase.from("creator_shots").select("*").eq("episode_id", activeEpisode.id).order("order_index"), supabase.from("creator_chat_sessions").select("*").eq("episode_id", activeEpisode.id)])
    const activeSessionId = chatSessions?.[0]?.id; const { data: chatMessages } = activeSessionId ? await supabase.from("creator_chat_messages").select("*").eq("session_id", activeSessionId).order("created_at") : { data: [] }
    return NextResponse.json({ project, episodes, activeEpisode, entities: entities || [], shots: shots || [], chatSessions: chatSessions || [], activeSessionId, chatMessages: chatMessages || [], userId: user.id })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load project" }, { status: 404 }) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId } = await params; const { supabase, project } = await ownedProject(projectId); const body = await request.json(); const updates: Record<string, string | null> = {}; for (const key of ["name", "description", "cover_image"]) if (body[key] !== undefined) updates[key] = body[key]
    const { data, error } = await supabase.from("creator_projects").update(updates).eq("id", project.id).select().single(); if (error) throw error; return NextResponse.json(data)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update base" }, { status: 400 }) }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId } = await params; const { supabase, project } = await ownedProject(projectId); const { error } = await supabase.from("creator_projects").delete().eq("id", project.id); if (error) throw error; return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete base" }, { status: 400 }) }
}

