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
    const projects = data || []
    const projectIds = projects.map((project) => project.id)
    const { data: entities, error: entitiesError } = projectIds.length
      ? await supabase
        .from("creator_entities")
        .select("project_id,type,reference_images,created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
      : { data: [], error: null }
    if (entitiesError) throw entitiesError

    const projectsWithGallery = await Promise.all(projects.map(async (project) => {
      const projectEntities = (entities || []).filter((entity) => entity.project_id === project.id)
      // Lead with characters, then use locations/props to fill a project visual strip.
      const orderedEntities = [
        ...projectEntities.filter((entity) => entity.type === "character"),
        ...projectEntities.filter((entity) => entity.type !== "character"),
      ]
      const paths = orderedEntities
        .flatMap((entity) => Array.isArray(entity.reference_images) ? entity.reference_images : [])
        .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
      if (!paths.length && typeof project.cover_image === "string" && project.cover_image.trim()) paths.push(project.cover_image)
      const gallery_images = (await Promise.all(Array.from(new Set(paths)).slice(0, 4).map(async (path) => {
        if (/^https?:\/\//i.test(path)) return path
        const { data: signed } = await supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
        return signed?.signedUrl || null
      }))).filter((path): path is string => Boolean(path))
      return { ...project, gallery_images }
    }))
    return NextResponse.json(projectsWithGallery)
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
