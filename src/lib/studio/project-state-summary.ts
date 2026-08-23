import type { SupabaseClient } from "@supabase/supabase-js"
import { computePipelineStage, emptySnapshot, pipelineInstructionBlock, type ProductionSnapshot } from "./pipeline"

// Past this, a job that never reached a terminal status is treated as abandoned
// rather than as work in flight. Generation takes 30–90 seconds; twenty minutes
// is long enough that nothing healthy is still running.
const STALE_JOB_AFTER_MS = 20 * 60 * 1000

/**
 * What the workspace actually contains right now, read once and shared by
 * everything that has to agree on where the production stands: the instructions
 * the Director reads, and the next-step button the user presses.
 */
function timestamp(value: unknown): number {
  if (typeof value !== "string") return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function imageGeneration(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null
  const record = (metadata as Record<string, unknown>).image_generation
  return record && typeof record === "object" ? record as Record<string, unknown> : null
}

/**
 * Whether an entity's reference art was made from the description it still has.
 *
 * The description recorded at generation time is the exact test. Art made
 * before that was recorded falls back to asking whether the description still
 * appears in the prompt it was generated from — imperfect, but it catches the
 * case that matters: a description rewritten wholesale, where none of the new
 * wording is in the old prompt.
 */
export function artIsStale(description: unknown, metadata: unknown): boolean {
  const current = typeof description === "string" ? description.trim() : ""
  if (!current) return false
  const generation = imageGeneration(metadata)
  if (!generation) return false

  const recorded = typeof generation.source_description === "string" ? generation.source_description.trim() : ""
  if (recorded) return recorded !== current

  const prompt = [generation.prompt, generation.resolved_prompt]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
  if (!prompt.trim()) return false
  // Comparing an opening fragment rather than the whole description: the prompt
  // wraps it in framing and style text, so it contains the description without
  // ever equalling it.
  const fragment = current.slice(0, 60).trim()
  return fragment.length >= 12 && !prompt.includes(fragment)
}

/** Whether a keyframe was generated from the prompt the shot still has. */
export function keyframeIsStale(prompt: unknown, metadata: unknown): boolean {
  const current = typeof prompt === "string" ? prompt.trim() : ""
  if (!current) return false
  const generation = imageGeneration(metadata)
  const used = generation && typeof generation.prompt === "string" ? generation.prompt.trim() : ""
  if (!used) return false
  return used !== current
}

export async function loadProductionSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  episodeId?: string,
  /**
   * The chat session the count is for.
   *
   * Without it the pipeline counted every pending proposal in the project while
   * the workspace only ever renders, and only ever withdraws, the ones
   * belonging to the open session. A card prepared in an earlier chat was
   * therefore counted forever and reachable never: the next step read "Review 1
   * pending change", pressing it sent a message rather than showing the card,
   * the card was in a session nobody was looking at, and the count never moved.
   * Pressing it again did the same thing.
   *
   * So the count is scoped to the cards the user can actually answer.
   */
  sessionId?: string,
): Promise<ProductionSnapshot> {
  const [episodesRes, entitiesRes, shotsRes, promptsRes, jobsRes, proposalsRes] = await Promise.all([
    supabase
      .from("creator_episodes")
      .select("id, name, script_content, order_index, status")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true }),
    supabase
      .from("creator_entities")
      .select("id, name, type, description, reference_images, metadata")
      .eq("project_id", projectId),
    episodeId
      ? supabase
          .from("creator_shots")
          .select("id, order_index, prompt, keyframe_image, video_url, video_status, metadata, updated_at")
          .eq("episode_id", episodeId)
          .order("order_index", { ascending: true })
      : supabase
          .from("creator_shots")
          .select("id, order_index, prompt, keyframe_image, video_url, video_status, metadata, updated_at")
          .eq("project_id", projectId)
          .order("order_index", { ascending: true }),
    // The prompt sheet is per episode; without one selected there is no sheet
    // to measure the rest of the pipeline against.
    episodeId
      ? supabase
          .from("creator_script_prompts")
          .select("order_index, entity_names, updated_at")
          .eq("project_id", projectId)
          .eq("episode_id", episodeId)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ order_index: number; entity_names: unknown }> }),
    // Generations already running. A shot mid-render still has no keyframe, so
    // on stored state alone it reads as the obvious next step — and offering it
    // charges the user for the same frame twice.
    //
    // Only recent ones count. A job that died without reaching a terminal status
    // stays "processing" forever, and treating that as work in progress removed
    // its shot from the pipeline permanently: no next step, no button, no way
    // forward except knowing to ask.
    supabase
      .from("creator_generation_jobs")
      .select("shot_id, type, status")
      .eq("project_id", projectId)
      .in("status", ["queued", "approved", "generating", "processing"])
      .gte("created_at", new Date(Date.now() - STALE_JOB_AFTER_MS).toISOString()),
    // Changes the Director prepared and the user has not answered. Until these
    // are decided nothing downstream can move, so the pipeline has to see them.
    supabase
      .from("creator_action_proposals")
      .select("id, expires_at, creator_tool_executions(session_id)")
      .eq("project_id", projectId)
      .eq("status", "pending"),
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
    // Only what the user can answer from where they are: this session's cards,
    // and not ones that have already timed out. A row whose status column still
    // says "pending" past its expiry is not something to block a production on.
    pendingApprovals: (proposalsRes.data || []).filter((proposal) => {
      const record = proposal as { expires_at?: string | null; creator_tool_executions?: { session_id?: string | null } | null }
      if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return false
      if (!sessionId) return true
      return (record.creator_tool_executions?.session_id ?? null) === sessionId
    }).length,
    hasScript: Boolean(scriptText && scriptText.length > 30),
    promptSheetCount: promptRows.length,
    // The most recent revision anywhere in the sheet: one entry changing means
    // the plan moved, and the shots written before it are behind.
    promptSheetRevisedAt: promptRows.reduce((latest, row) => Math.max(latest, timestamp((row as { updated_at?: string }).updated_at)), 0),
    promptSheetEntityNames: promptRows.flatMap((row) => Array.isArray(row.entity_names) ? row.entity_names.filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim())) : []),
    entities: (entitiesRes.data || []).map((entity) => ({
      name: entity.name,
      type: entity.type,
      hasReferenceImage: Array.isArray(entity.reference_images) && entity.reference_images.length > 0,
      artIsStale: artIsStale(entity.description, entity.metadata),
    })),
    shots: (shotsRes.data || []).map((shot) => ({
      number: shot.order_index + 1,
      hasPrompt: typeof shot.prompt === "string" && Boolean(shot.prompt.trim()),
      hasKeyframe: Boolean(shot.keyframe_image),
      hasVideo: Boolean(shot.video_url) || shot.video_status === "completed",
      imageInFlight: imageInFlight.has(shot.id),
      videoInFlight: videoInFlight.has(shot.id),
      keyframeIsStale: keyframeIsStale(shot.prompt, shot.metadata),
      promptUpdatedAt: timestamp(shot.updated_at),
    })),
  }
}

export async function buildProjectStateSummary(
  supabase: SupabaseClient,
  projectId: string,
  episodeId?: string,
  sessionId?: string,
): Promise<string> {
  try {
    const snapshot = await loadProductionSnapshot(supabase, projectId, episodeId, sessionId)
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
