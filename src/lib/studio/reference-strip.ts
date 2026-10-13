import { entityPrimaryReference, type MentionableEntity } from "./entity-mentions"

/**
 * Asset pictures a render must not be given on the server's own initiative.
 *
 * The reference strip in the generation panel is what the render gets. The
 * server also knows every asset the request names — a cast member, an @mention
 * — and used to attach each one's main picture regardless, so a tile that had
 * been removed, or swapped for a different picture of the same character, was
 * sent anyway. This is the list that stops it: the main picture of every named
 * asset that is not a tile in the strip.
 */
export function assetReferencesNotShown(
  entities: Array<MentionableEntity & { id: string }>,
  namedEntityIds: string[],
  shown: string[],
): string[] {
  const named = new Set(namedEntityIds)
  const visible = new Set(shown)
  const hidden = entities
    .filter((entity) => named.has(entity.id))
    .map((entity) => entityPrimaryReference(entity))
    .filter((path): path is string => typeof path === "string" && path.length > 0 && !visible.has(path))
  return Array.from(new Set(hidden))
}
