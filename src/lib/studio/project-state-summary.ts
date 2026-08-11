import type { SupabaseClient } from "@supabase/supabase-js"

export async function buildProjectStateSummary(
  supabase: SupabaseClient,
  projectId: string,
  episodeId?: string,
): Promise<string> {
  try {
    const [episodesRes, entitiesRes, shotsRes] = await Promise.all([
      supabase
        .from("creator_episodes")
        .select("id, name, description, script_content, order_index")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true }),
      supabase
        .from("creator_entities")
        .select("id, name, type, reference_images")
        .eq("project_id", projectId),
      episodeId
        ? supabase
            .from("creator_shots")
            .select("id, title, prompt, keyframe_image, video_url, video_status")
            .eq("episode_id", episodeId)
            .order("order_index", { ascending: true })
        : supabase
            .from("creator_shots")
            .select("id, title, prompt, keyframe_image, video_url, video_status")
            .eq("project_id", projectId)
            .order("order_index", { ascending: true }),
    ])

    const episodes = episodesRes.data || []
    const entities = entitiesRes.data || []
    const shots = shotsRes.data || []

    const activeEpisode = episodes.find((e) => e.id === episodeId) || episodes[0]
    const scriptText = activeEpisode?.script_content ? JSON.stringify(activeEpisode.script_content) : ""
    const hasScript = Boolean(scriptText && scriptText.length > 30)

    const characterEntities = entities.filter((e) => e.type === "character")
    const sceneEntities = entities.filter((e) => e.type === "scene")
    const propEntities = entities.filter((e) => e.type === "prop")
    const charactersWithImages = characterEntities.filter(
      (e) => Array.isArray(e.reference_images) && e.reference_images.length > 0
    )

    const keyframedShots = shots.filter((s) => Boolean(s.keyframe_image))
    const videoShots = shots.filter((s) => Boolean(s.video_url) || s.video_status === "completed")

    // Calculate production phase and next recommended step
    let currentPhase = "Phase 1: Concept & Scripting"
    let recommendedNextStep = "Write or refine the production script with scene breakdown."

    if (hasScript) {
      if (characterEntities.length === 0) {
        currentPhase = "Phase 2: Character & Asset Creation"
        recommendedNextStep = "Extract and define character/scene assets from the script."
      } else if (charactersWithImages.length < characterEntities.length) {
        currentPhase = "Phase 2: Character Turnaround & Image Generation"
        recommendedNextStep = `Generate reference turnaround images for character assets (${charactersWithImages.length}/${characterEntities.length} complete).`
      } else if (shots.length === 0) {
        currentPhase = "Phase 3: Storyboard & Shot Breakdown"
        recommendedNextStep = "Break down the script into visual shots and keyframe prompts."
      } else if (keyframedShots.length < shots.length) {
        currentPhase = "Phase 4: Keyframe Image Generation"
        recommendedNextStep = `Generate keyframe images for shots (${keyframedShots.length}/${shots.length} keyframed).`
      } else if (videoShots.length < shots.length) {
        currentPhase = "Phase 5: AI Video Generation"
        recommendedNextStep = `Render video clips for storyboard shots (${videoShots.length}/${shots.length} rendered).`
      } else {
        currentPhase = "Phase 6: Review & Final Polish"
        recommendedNextStep = "Review continuity across all rendered video clips and export the final film."
      }
    }

    return [
      "=== LIVE PROJECT PRODUCTION STATE ===",
      `Active Episode: ${activeEpisode ? activeEpisode.name : "Episode 1"}`,
      `Script Status: ${hasScript ? "Script written and saved" : "No script saved yet"}`,
      `Assets: ${entities.length} total (${characterEntities.length} characters [${charactersWithImages.length} with turnaround images], ${sceneEntities.length} scenes, ${propEntities.length} props)`,
      `Storyboard Shots: ${shots.length} total shots (${keyframedShots.length} keyframed, ${videoShots.length} video rendered)`,
      `Current Production Phase: ${currentPhase}`,
      `Recommended Director Action: ${recommendedNextStep}`,
      "========================================",
    ].join("\n")
  } catch (err) {
    console.warn("Could not build project state summary:", err)
    return "=== LIVE PROJECT PRODUCTION STATE: Unavailable ==="
  }
}
