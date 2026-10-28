import type { SupabaseClient } from "@supabase/supabase-js"
import { projectVisualStyle } from "./entity-image-workflow"
import { asksForClaymation, CLAYMATION_STYLE, isPhotorealStyle, sameVisualStyle } from "./visual-style"

type ShotRow = { id: string; style: string | null; metadata: Record<string, unknown> | null }

async function projectShots(supabase: SupabaseClient, projectId: string): Promise<ShotRow[]> {
  const { data: episodes, error: episodeError } = await supabase.from("creator_episodes").select("id").eq("project_id", projectId)
  if (episodeError) throw episodeError
  const episodeIds = (episodes || []).map((episode) => episode.id as string)
  if (!episodeIds.length) return []
  const { data, error } = await supabase.from("creator_shots").select("id,style,metadata").in("episode_id", episodeIds)
  if (error) throw error
  return (data || []) as ShotRow[]
}

const overridden = (shot: ShotRow) => shot.metadata?.style_override === true

/** How many shots a project style change would carry, and how many keep their own. */
export async function countStyleFollowers(supabase: SupabaseClient, projectId: string) {
  const shots = await projectShots(supabase, projectId)
  const own = shots.filter(overridden).length
  return { following: shots.length - own, overridden: own }
}

/**
 * Carries a project style change to the shots that follow the project.
 *
 * A shot set to its own style on purpose is never touched. The rest either take
 * the new style (`follow`), or — when the user said no — are pinned to the style
 * they were made in, so the old frames and the new ones are not silently mixed.
 */
export async function carryStyleToShots(supabase: SupabaseClient, projectId: string, previousStyle: string, nextStyle: string, follow: boolean) {
  if (sameVisualStyle(previousStyle, nextStyle)) return { updated: 0, pinned: 0 }
  const followers = (await projectShots(supabase, projectId)).filter((shot) => !overridden(shot))
  if (follow) {
    const stale = followers.filter((shot) => shot.style !== nextStyle).map((shot) => shot.id)
    if (stale.length) {
      const { error } = await supabase.from("creator_shots").update({ style: nextStyle }).in("id", stale)
      if (error) throw error
    }
    return { updated: stale.length, pinned: 0 }
  }
  for (const shot of followers) {
    const { error } = await supabase.from("creator_shots")
      .update({ style: previousStyle, metadata: { ...(shot.metadata || {}), style_override: true } })
      .eq("id", shot.id)
    if (error) throw error
  }
  return { updated: 0, pinned: followers.length }
}

/**
 * Lets shots pinned to Photorealistic follow the project again.
 *
 * The answer to a held generation. Switching the project alone leaves pinned
 * shots where they were, so on a project already on Claymation — every shot
 * pinned when someone declined to apply the change — "Switch" changed nothing
 * and the same render was held again.
 */
export async function releasePhotorealPins(supabase: SupabaseClient, projectId: string, style: string) {
  const pinned = (await projectShots(supabase, projectId)).filter((shot) => overridden(shot) && isPhotorealStyle(shot.style || ""))
  for (const shot of pinned) {
    const { style_override: _released, ...metadata } = shot.metadata || {}
    const { error } = await supabase.from("creator_shots").update({ style, metadata }).eq("id", shot.id)
    if (error) throw error
  }
  return pinned.length
}

/**
 * Sets a project's Visual style where every generation reads it — default_style
 * and basic_settings.visualStyle — and carries it to the shots. With
 * `releasePins`, shots pinned to Photorealistic follow it too.
 */
export async function setProjectVisualStyle(supabase: SupabaseClient, projectId: string, style: string, follow = true, releasePins = false) {
  const { data: project, error: readError } = await supabase.from("creator_projects").select("default_style,metadata").eq("id", projectId).single()
  if (readError) throw readError
  const previousStyle = projectVisualStyle(project)
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const { error } = await supabase.from("creator_projects")
    .update({ default_style: style, metadata: { ...metadata, basic_settings: { ...basicSettings, visualStyle: style } } })
    .eq("id", projectId)
  if (error) throw error
  const shots = await carryStyleToShots(supabase, projectId, previousStyle, style, follow)
  const released = releasePins ? await releasePhotorealPins(supabase, projectId, style) : 0
  return { previousStyle, style, ...shots, released }
}

/**
 * A new project whose brief, script or first request asks for claymation is
 * set to claymation, so the first frame is not drawn under the live-action
 * block.
 *
 * Only while the project still has no shots and is on the photorealistic
 * default: once a storyboard exists, or the user chose another style, a change
 * of style is theirs to make — the generation guard asks them instead.
 */
export async function adoptClaymationIfAsked(supabase: SupabaseClient, projectId: string, ...texts: Array<string | null | undefined>) {
  if (!asksForClaymation(...texts)) return null
  const { data: project } = await supabase.from("creator_projects").select("default_style,metadata").eq("id", projectId).maybeSingle()
  if (!project || !isPhotorealStyle(projectVisualStyle(project))) return null
  if ((await projectShots(supabase, projectId)).length) return null
  return setProjectVisualStyle(supabase, projectId, CLAYMATION_STYLE)
}
