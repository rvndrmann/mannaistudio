import type { SupabaseClient } from "@supabase/supabase-js"

export type StudioProject = {
    id: string; profile_id: string; title: string; description: string; visual_style: string; aspect_ratio: string; created_at: string
}
export type StudioEpisode = { id: string; project_id: string; title: string; script: string; position: number }
export type StudioShot = { id: string; episode_id: string; title: string; prompt: string; duration_seconds: number; position: number }

export async function fetchStudioProjects(supabase: SupabaseClient) {
    const { data, error } = await supabase.from("studio_projects").select("*").order("created_at", { ascending: false })
    if (error) throw error
    return (data || []) as StudioProject[]
}

export async function createStudioProject(supabase: SupabaseClient, project: Omit<StudioProject, "id" | "created_at">) {
    const { data, error } = await supabase.from("studio_projects").insert(project).select("*").single()
    if (error) throw error
    return data as StudioProject
}

export async function deleteStudioProject(supabase: SupabaseClient, id: string) {
    const { error } = await supabase.from("studio_projects").delete().eq("id", id)
    if (error) throw error
}

export async function fetchProjectWorkspace(supabase: SupabaseClient, projectId: string) {
    const { data: episodes, error } = await supabase.from("studio_episodes").select("*").eq("project_id", projectId).order("position")
    if (error) throw error
    const ids = (episodes || []).map((episode) => episode.id)
    const { data: shots, error: shotsError } = ids.length ? await supabase.from("studio_shots").select("*").in("episode_id", ids).order("position") : { data: [], error: null }
    if (shotsError) throw shotsError
    return { episodes: (episodes || []) as StudioEpisode[], shots: (shots || []) as StudioShot[] }
}

export async function addStudioEpisode(supabase: SupabaseClient, projectId: string, title: string, position: number) {
    const { data, error } = await supabase.from("studio_episodes").insert({ project_id: projectId, title, position }).select("*").single()
    if (error) throw error
    return data as StudioEpisode
}

export async function addStudioShot(supabase: SupabaseClient, episodeId: string, title: string, prompt: string, position: number) {
    const { data, error } = await supabase.from("studio_shots").insert({ episode_id: episodeId, title, prompt, position }).select("*").single()
    if (error) throw error
    return data as StudioShot
}
