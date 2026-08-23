import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Every shot happens somewhere.
 *
 * A prompt names the location only when the location changes — "she backs away"
 * is still in the bedroom the shot before it was in — so a storyboard built
 * from the script ends up with locations on the shots that introduce them and
 * nothing on the shots between. Generation reads the shot's linked assets, so
 * those in-between shots were rendered with no location at all, and the model
 * filled the gap from whatever background the character's reference photo
 * happened to have. A shot set in an apartment came back in an open field.
 *
 * The scene carries forward until the script moves it, which is how a scene
 * works on set. A cast the user curated by hand is never touched.
 */

export type LocatableShot = {
  id: string
  order_index: number
  referenced_entities?: string[] | null
  metadata?: unknown
}

export type LocatableEntity = { id: string; type: string }

function isCurated(shot: LocatableShot) {
  const metadata = shot.metadata as { cast_curated?: boolean } | null | undefined
  return Boolean(metadata?.cast_curated)
}

/**
 * The location each shot should carry, for the shots that are missing one.
 *
 * Looks back first — a scene continues until something changes it — and only
 * looks forward for the shots before the first location is ever named, which
 * would otherwise have nothing to inherit.
 */
export function inheritedShotLocations(shots: LocatableShot[], entities: LocatableEntity[]): Map<string, string> {
  const locationIds = new Set(entities.filter((entity) => entity.type === "scene").map((entity) => entity.id))
  const ordered = [...shots].sort((a, b) => a.order_index - b.order_index)
  const locationOf = (shot: LocatableShot) => (shot.referenced_entities || []).find((id) => locationIds.has(id)) || null

  const repairs = new Map<string, string>()
  let carried: string | null = null
  const awaitingFirst: LocatableShot[] = []

  for (const shot of ordered) {
    const own = locationOf(shot)
    if (own) {
      carried = own
      // The opening shots had no scene behind them to inherit; the first one
      // named is the nearest thing they belong to.
      for (const earlier of awaitingFirst.splice(0)) repairs.set(earlier.id, own)
      continue
    }
    // A curated cast used to stop here, and this branch is only ever reached
    // for a shot carrying no location at all — so the exemption did not protect
    // a hand-picked cast, it allowed a shot to be set nowhere. Curating shot 2
    // to Sara and the car left it with no street, and the generation card
    // offered two references while the shot plainly happens on the road every
    // other shot happens on.
    //
    // Curation decides which characters and props are in frame. It is not a way
    // to say the shot happens nowhere, because no shot does. A location that
    // genuinely does not belong is removed from the strip on the generation
    // card, which is a per-render choice rather than a permanent hole in the
    // storyboard.
    if (isCurated(shot) && !locationIds.size) continue
    if (carried) repairs.set(shot.id, carried)
    else awaitingFirst.push(shot)
  }

  // Nothing named a location anywhere in the episode.
  //
  // The carry-forward above only works from a shot that already has one, so an
  // episode where no prompt ever @mentions the scene left every shot with
  // nowhere to be: awaitingFirst filled up, no shot ever set `carried`, and the
  // list was dropped on the way out. That is the ordinary case, not an edge —
  // a prompt names the place it is in far less often than it names who is in
  // frame, and the Storyboard Agent tags characters and props reliably while
  // leaving the location to the setting.
  //
  // One scene in the project is unambiguous: it is where the episode happens.
  // Several is a real choice between them, and guessing would put shots in the
  // wrong place, so those are left for the writer to tag.
  if (carried === null && awaitingFirst.length) {
    const scenes = entities.filter((entity) => entity.type === "scene")
    if (scenes.length === 1) {
      for (const shot of awaitingFirst) repairs.set(shot.id, scenes[0].id)
    }
  }
  return repairs
}

/**
 * Fills in the missing locations and saves them, so the render and the assets
 * column both show the scene the shot is actually in.
 */
export async function ensureShotLocations(
  supabase: SupabaseClient,
  input: { shots: LocatableShot[]; entities: LocatableEntity[] },
): Promise<Map<string, string>> {
  const repairs = inheritedShotLocations(input.shots, input.entities)
  if (!repairs.size) return repairs
  const byId = new Map(input.shots.map((shot) => [shot.id, shot]))
  await Promise.all(Array.from(repairs.entries()).map(async ([shotId, locationId]) => {
    const shot = byId.get(shotId)
    if (!shot) return
    const cast = Array.from(new Set([...(shot.referenced_entities || []), locationId]))
    const { error } = await supabase.from("creator_shots").update({ referenced_entities: cast }).eq("id", shotId)
    if (error) throw error
    // Kept in step so the caller builds its prompt from the repaired cast.
    shot.referenced_entities = cast
  }))
  return repairs
}

/**
 * Repairs every episode in a project.
 *
 * The inheritance ran once, while a storyboard batch was being written, over
 * that batch alone. But the ordinary order of work here is script → prompt
 * sheet → shots → entities: the characters and locations are created *from* the
 * finished sheet, which is after the shots exist. So at the only moment the
 * repair ran there was no location entity to inherit, and nothing revisited the
 * storyboard once one appeared. Shots sat with no scene from the day they were
 * written.
 *
 * Running it when a location is created is what closes that window. Shots are
 * grouped by episode because a scene carries forward within an episode and not
 * across one.
 */
export async function ensureProjectShotLocations(
  supabase: SupabaseClient,
  input: { projectId: string; entities: LocatableEntity[] },
): Promise<number> {
  if (!input.entities.some((entity) => entity.type === "scene")) return 0
  const { data: episodes } = await supabase.from("creator_episodes").select("id").eq("project_id", input.projectId)
  const episodeIds = (episodes || []).map((episode) => episode.id as string)
  if (!episodeIds.length) return 0
  const { data: shots } = await supabase
    .from("creator_shots")
    .select("id,order_index,referenced_entities,metadata,episode_id")
    .in("episode_id", episodeIds)
    .order("order_index")
  if (!shots?.length) return 0

  let repaired = 0
  for (const episodeId of episodeIds) {
    const episodeShots = shots.filter((shot) => shot.episode_id === episodeId)
    if (!episodeShots.length) continue
    const repairs = await ensureShotLocations(supabase, { shots: episodeShots, entities: input.entities })
    repaired += repairs.size
  }
  return repaired
}
