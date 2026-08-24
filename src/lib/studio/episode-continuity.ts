import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Continuity across the episode boundary.
 *
 * An episode is a cut of the same story, not a separate one: shot 1 of Episode 3
 * picks up where Episode 2 left off. Everything else in the production reads one
 * episode at a time, so the clip that shot 1 should continue from — the previous
 * episode's last rendered shot — was the one reference the workspace could not
 * name, and every episode opened cold.
 */

export type EpisodeFootage = {
  id: string
  name: string
  orderIndex: number
  shotCount: number
  /** The last shot in this episode with a finished clip — where it hands over. */
  finalClip: { shotNumber: number; videoPath: string } | null
}

export type EpisodeHandoff = {
  episodeId: string
  episodeName: string
  shotNumber: number
  videoPath: string
}

/** The label the continuation prompt uses for a clip from another episode. */
export function handoffAlias(handoff: EpisodeHandoff) {
  return `@${handoff.episodeName} shot ${handoff.shotNumber} video`
}

export async function fetchEpisodeFootage(supabase: SupabaseClient, projectId: string): Promise<EpisodeFootage[]> {
  const { data: episodes, error } = await supabase
    .from("creator_episodes")
    .select("id,name,order_index")
    .eq("project_id", projectId)
    .order("order_index")
  if (error) throw error
  if (!episodes?.length) return []

  const { data: shots, error: shotsError } = await supabase
    .from("creator_shots")
    .select("episode_id,order_index,video_url,video_status")
    .in("episode_id", episodes.map((episode) => episode.id))
    .order("order_index")
  if (shotsError) throw shotsError

  return episodes.map((episode) => {
    const own = (shots || []).filter((shot) => shot.episode_id === episode.id)
    // The last shot that actually rendered, not the last shot that exists: an
    // unrendered tail shot would otherwise hide the footage behind it.
    const finished = own.filter((shot) => shot.video_url && shot.video_status === "completed")
    const last = finished.at(-1)
    return {
      id: episode.id,
      name: episode.name,
      orderIndex: episode.order_index,
      shotCount: own.length,
      finalClip: last ? { shotNumber: last.order_index + 1, videoPath: last.video_url as string } : null,
    }
  })
}

/**
 * Where the episode before this one left off, if it left off anywhere.
 *
 * "The episode before" is the nearest earlier one that actually has footage —
 * an empty episode sitting between two finished ones is a gap in the schedule,
 * not a break in the story.
 */
export function previousEpisodeHandoff(footage: EpisodeFootage[], currentEpisodeId: string): EpisodeHandoff | null {
  const current = footage.find((episode) => episode.id === currentEpisodeId)
  if (!current) return null
  const earlier = footage
    .filter((episode) => episode.orderIndex < current.orderIndex && episode.finalClip)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .at(-1)
  if (!earlier?.finalClip) return null
  return { episodeId: earlier.id, episodeName: earlier.name, shotNumber: earlier.finalClip.shotNumber, videoPath: earlier.finalClip.videoPath }
}

/**
 * The other episodes, written for the Director.
 *
 * Without this the agent has only "Current episode ID" and no way to name
 * another episode, so a request to carry a shot over from an earlier one had
 * nothing to look it up with.
 */
export function episodeFootageInstructions(footage: EpisodeFootage[], currentEpisodeId: string) {
  if (footage.length < 2) return ""
  const lines = footage.map((episode) => {
    const here = episode.id === currentEpisodeId ? " (the episode open now)" : ""
    const clip = episode.finalClip
      ? `last rendered clip: shot ${episode.finalClip.shotNumber}`
      : "no rendered clips yet"
    return `- ${episode.name}${here} — id ${episode.id}, ${episode.shotCount} shot${episode.shotCount === 1 ? "" : "s"}, ${clip}`
  })
  return [
    "EPISODES IN THIS PROJECT:",
    ...lines,
    "These are cuts of one story. When the user wants a shot to continue from another episode — including the ordinary case of shot 1 continuing from the previous episode's ending — call list_storyboard_shots with that episode's id, take the video_url of the shot they mean, and pass it to submit_generation as videoReferencePaths. Leave videoReferenceShotNumbers empty for a clip from another episode: shot numbers resolve against the episode being generated, so a number from elsewhere would target the wrong shot. Name the episode and shot number in your reply so the user can see which clip you carried over before approving.",
    // Continuity is an enhancement, never a precondition. An earlier episode
    // with no rendered clip is the ordinary state of a production being built in
    // order — the first episode has nothing before it, and a later one is
    // usually storyboarded before the one ahead of it is filmed. Without this
    // the Director read a missing hand-off clip as a blocker and refused to
    // submit at all, so a shot with an approved keyframe and a saved prompt
    // could not be filmed until unrelated footage existed. The keyframe is the
    // clip's first frame and is attached automatically, so a shot is always
    // filmable on its own.
    "A missing clip is not a blocker. If the episode you would carry over from has no rendered clips yet, do not refuse and do not wait: submit the generation with no videoReferencePaths at all. The shot's own approved keyframe is the clip's first frame and is attached for you, so the shot renders correctly without any continuity clip. Say in one line that you filmed it without a continuity reference because that episode has no rendered clip yet, and carry on.",
  ].join("\n")
}
