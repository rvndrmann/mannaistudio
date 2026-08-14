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
    if (isCurated(shot)) continue
    if (carried) repairs.set(shot.id, carried)
    else awaitingFirst.push(shot)
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
