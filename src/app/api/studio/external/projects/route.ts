import { NextRequest, NextResponse } from "next/server"
import { studioErrorStatus } from "@/lib/studio/server-context"
import { validateExternalRequest } from "@/lib/studio/external-auth"

export async function GET(request: NextRequest) {
  try {
    const external = await validateExternalRequest(request, "projects:read")
    if (!external) return NextResponse.json({ error: "Bearer token required" }, { status: 401 })
    const { data: projects, error } = await external.supabase
      .from("creator_projects")
      .select("id,name,description,production_mode,project_type,created_at,updated_at")
      .eq("user_id", external.user.id)
      .order("updated_at", { ascending: false })
    if (error) throw error

    const projectIds = (projects || []).map((project) => project.id)
    const { data: episodes } = projectIds.length
      ? await external.supabase
        .from("creator_episodes")
        .select("id,project_id,name,status,created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: true })
      : { data: [] }

    const { data: sessions } = episodes?.length
      ? await external.supabase
        .from("creator_chat_sessions")
        .select("id,episode_id,title,model,created_at,updated_at")
        .eq("user_id", external.user.id)
        .in("episode_id", episodes.map((episode) => episode.id))
        .order("updated_at", { ascending: false })
      : { data: [] }

    return NextResponse.json({
      projects: (projects || []).map((project) => {
        const projectEpisodes = (episodes || []).filter((episode) => episode.project_id === project.id)
        const defaultEpisode = projectEpisodes[0] || null
        const defaultSession = defaultEpisode
          ? (sessions || []).find((session) => session.episode_id === defaultEpisode.id) || null
          : null
        return {
          ...project,
          defaultEpisodeId: defaultEpisode?.id || null,
          defaultSessionId: defaultSession?.id || null,
          episodes: projectEpisodes,
        }
      }),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load external projects" }, { status: studioErrorStatus(error) })
  }
}
