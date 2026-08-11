import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createStudioProjectInputSchema, isMissingProductionModeSchema } from "@/lib/studio/domain"

function getDbClient(fallback: any) {
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createServiceClient()
    }
  } catch (e) {
    console.warn("Could not instantiate service client:", e)
  }
  return fallback
}

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  try {
    const db = getDbClient(supabase)
    await db.from("profiles").upsert(
      { id: user.id, full_name: user.user_metadata?.full_name || "Creator", avatar_url: user.user_metadata?.avatar_url || "", email: user.email || "" },
      { onConflict: "id" }
    )
  } catch (err) {
    console.warn("Could not upsert profile during project creation:", err)
  }
  return { supabase, user }
}

function extractErrorMessage(err: unknown): string {
  if (!err) return "Unknown error"
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === "string" && obj.message) return obj.message
    if (typeof obj.details === "string" && obj.details) return obj.details
    if (typeof obj.error === "string" && obj.error) return obj.error
  }
  return String(err)
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser()
    const { data, error } = await supabase.from("creator_projects").select("*").order("created_at", { ascending: false })
    if (error) throw error

    const { data: owners } = await supabase.rpc("accessible_project_owners")
    const ownerById = new Map<string, { owner_name: string | null; owner_email: string | null }>(
      (owners || []).map((row: { project_id: string; owner_name: string | null; owner_email: string | null }) => [row.project_id, row]),
    )
    const projects = (data || []).map((project) => {
      const owner = ownerById.get(project.id)
      return {
        ...project,
        shared: project.user_id !== user.id,
        ownerName: project.user_id === user.id ? null : owner?.owner_name || null,
        ownerEmail: project.user_id === user.id ? null : owner?.owner_email || null,
      }
    })
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
  } catch (error) {
    const message = extractErrorMessage(error)
    const status = message === "Unauthorized" ? 401 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser()
    const rawBody = await request.json().catch(() => ({}))
    const parsed = createStudioProjectInputSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid project details", issues: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const body = parsed.data
    const optionalMode = body.production_mode ? { production_mode: body.production_mode, project_type: body.project_type || "unspecified" } : {}
    const baseProject = { user_id: user.id, name: body.name, description: body.description || null, cover_image: body.cover_image || null }

    const db = getDbClient(supabase)

    let { data: project, error } = await db.from("creator_projects").insert({ ...baseProject, ...optionalMode }).select().single()
    let compatibilityWarning: string | null = null
    if (error && body.production_mode && isMissingProductionModeSchema(error)) {
      const fallback = await db.from("creator_projects").insert(baseProject).select().single()
      project = fallback.data
      error = fallback.error
      compatibilityWarning = "Project created with the legacy schema. Apply the additive AI Director migrations to persist its production mode."
    }
    if (error || !project) throw error || new Error("Project was not created")

    const { data: episode, error: episodeError } = await db.from("creator_episodes").insert({ project_id: project.id, name: "Episode 1", description: `First episode of ${project.name}`, status: "in_progress" }).select().single()
    if (episodeError) throw episodeError

    const { data: session, error: sessionError } = await db.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: user.id, title: "New Chat" }).select().single()
    if (sessionError) throw sessionError

    return NextResponse.json({ project, episodeId: episode.id, sessionId: session.id, compatibilityWarning })
  } catch (error) {
    const message = extractErrorMessage(error)
    const status = message === "Unauthorized" ? 401 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
