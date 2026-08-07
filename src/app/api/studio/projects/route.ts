import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createStudioProjectInputSchema, isMissingProductionModeSchema } from "@/lib/studio/domain"

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
    const { supabase, user } = await currentUser()
    const parsed = createStudioProjectInputSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Invalid project details", issues: parsed.error.flatten().fieldErrors }, { status: 400 })
    const body = parsed.data
    const optionalMode = body.production_mode ? { production_mode: body.production_mode, project_type: body.project_type || "unspecified" } : {}
    const baseProject = { user_id: user.id, name: body.name, description: body.description || null, cover_image: body.cover_image || null }
    let { data: project, error } = await supabase.from("creator_projects").insert({ ...baseProject, ...optionalMode }).select().single()
    let compatibilityWarning: string | null = null
    if (error && body.production_mode && isMissingProductionModeSchema(error)) {
      const fallback = await supabase.from("creator_projects").insert(baseProject).select().single()
      project = fallback.data
      error = fallback.error
      compatibilityWarning = "Project created with the legacy schema. Apply the additive AI Director migrations to persist its production mode."
    }
    if (error || !project) throw error || new Error("Project was not created")
    const { data: episode, error: episodeError } = await supabase.from("creator_episodes").insert({ project_id: project.id, name: "Episode 1", description: `First episode of ${project.name}`, status: "in_progress" }).select().single()
    if (episodeError) throw episodeError
    const { data: session, error: sessionError } = await supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: user.id, title: "New Chat" }).select().single()
    if (sessionError) throw sessionError
    return NextResponse.json({ project, episodeId: episode.id, sessionId: session.id, compatibilityWarning })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create base" }, { status: 400 }) }
}
