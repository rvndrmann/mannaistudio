import type { SupabaseClient } from "@supabase/supabase-js"
import { computePipelineStage, emptySnapshot, pipelineInstructionBlock, type ProductionSnapshot } from "./pipeline"

/**
 * What the workspace actually contains right now, read once and shared by
 * everything that has to agree on where the production stands: the instructions
 * the Director reads, and the next-step button the user presses.
 */
export async function loadProductionSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  episodeId?: string,
): Promise<ProductionSnapshot> {
  const [episodesRes, entitiesRes, shotsRes, promptsRes, jobsRes] = await Promise.all([
    supabase
      .from("creator_episodes")
      .select("id, name, script_content, order_index")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true }),
    supabase
      .from("creator_entities")
      .select("id, name, type, reference_images")
      .eq("project_id", projectId),
    episodeId
      ? supabase
          .from("creator_shots")
          .select("id, order_index, prompt, keyframe_image, video_url, video_status")
          .eq("episode_id", episodeId)
          .order("order_index", { ascending: true })
      : supabase
          .from("creator_shots")
          .select("id, order_index, prompt, keyframe_image, video_url, video_status")
          .eq("project_id", projectId)
          .order("order_index", { ascending: true }),
    // The prompt sheet is per episode; without one selected there is no sheet
    // to measure the rest of the pipeline against.
    episodeId
      ? supabase
          .from("creator_script_prompts")
          .select("order_index, entity_names")
          .eq("project_id", projectId)
          .eq("episode_id", episodeId)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ order_index: number; entity_names: unknown }> }),
    // Generations already running. A shot mid-render still has no keyframe, so
    // on stored state alone it reads as the obvious next step — and offering it
    // charges the user for the same frame twice.
    supabase
      .from("creator_generation_jobs")
      .select("shot_id, type, status")
      .eq("project_id", projectId)
      .in("status", ["queued", "approved", "generating", "processing"]),
  ])

  const episodes = episodesRes.data || []
  const activeEpisode = episodes.find((episode) => episode.id === episodeId) || episodes[0]
  const scriptText = activeEpisode?.script_content ? JSON.stringify(activeEpisode.script_content) : ""
  const promptRows = promptsRes.data || []
  const imageInFlight = new Set<string>()
  const videoInFlight = new Set<string>()
  for (const job of jobsRes.data || []) {
    if (typeof job.shot_id !== "string") continue
    ;(job.type === "video" ? videoInFlight : imageInFlight).add(job.shot_id)
  }

  return {
    episodeName: activeEpisode?.name || "Episode 1",
    hasScript: Boolean(scriptText && scriptText.length > 30),
    promptSheetCount: promptRows.length,
    promptSheetEntityNames: promptRows.flatMap((row) => Array.isArray(row.entity_names) ? row.entity_names.filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim())) : []),
    entities: (entitiesRes.data || []).map((entity) => ({
      name: entity.name,
      type: entity.type,
      hasReferenceImage: Array.isArray(entity.reference_images) && entity.reference_images.length > 0,
    })),
    shots: (shotsRes.data || []).map((shot) => ({
      number: shot.order_index + 1,
      hasPrompt: typeof shot.prompt === "string" && Boolean(shot.prompt.trim()),
      hasKeyframe: Boolean(shot.keyframe_image),
      hasVideo: Boolean(shot.video_url) || shot.video_status === "completed",
      imageInFlight: imageInFlight.has(shot.id),
      videoInFlight: videoInFlight.has(shot.id),
    })),
  }
}

export async function buildProjectStateSummary(
  supabase: SupabaseClient,
  projectId: string,
  episodeId?: string,
): Promise<string> {
  try {
    const snapshot = await loadProductionSnapshot(supabase, projectId, episodeId)
    return buildProjectStateSummaryFrom(snapshot)
  } catch (err) {
    console.warn("Could not build project state summary:", err)
    return "=== LIVE PROJECT PRODUCTION STATE: Unavailable ==="
  }
}

export function buildProjectStateSummaryFrom(snapshot: ProductionSnapshot = emptySnapshot): string {
  const stage = computePipelineStage(snapshot)
  const characters = snapshot.entities.filter((entity) => entity.type === "character")
  const scenes = snapshot.entities.filter((entity) => entity.type === "scene")
  const props = snapshot.entities.filter((entity) => entity.type === "prop")
  return [
    "=== LIVE PROJECT PRODUCTION STATE ===",
    `Active Episode: ${snapshot.episodeName}`,
    `Script Status: ${snapshot.hasScript ? "Script written and saved" : "No script saved yet"}`,
    `Prompt Sheet: ${snapshot.promptSheetCount} saved shot prompt${snapshot.promptSheetCount === 1 ? "" : "s"}`,
    `Assets: ${snapshot.entities.length} total (${characters.length} characters [${characters.filter((entity) => entity.hasReferenceImage).length} with reference art], ${scenes.length} scenes, ${props.length} props)`,
    `Storyboard Shots: ${snapshot.shots.length} total shots (${snapshot.shots.filter((shot) => shot.hasKeyframe).length} keyframed, ${snapshot.shots.filter((shot) => shot.hasVideo).length} video rendered)`,
    `Current Production Stage: ${stage.title}`,
    `Recommended Director Action: ${stage.nextAction?.intent || "Review the finished cut with the user."}`,
    "========================================",
    pipelineInstructionBlock(snapshot),
  ].join("\n")
}
