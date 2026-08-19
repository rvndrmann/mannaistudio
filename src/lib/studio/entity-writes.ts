/**
 * The one place a character or asset is prepared for the database.
 *
 * The same story as shot-writes. `update_asset` learned to merge metadata
 * rather than replace it, because the column holds `image_generation` — the
 * record of which description the reference art was made from. Overwrite that
 * while revising a look and `artIsStale()` finds no provenance, calls the art
 * clean, and the pipeline moves on to the storyboard with location plates and
 * faces still showing the description the user just replaced.
 *
 * The Characters & Assets editor never learned it. It wrote
 * `metadata: body.asset.metadata || {}` — a wholesale replace, and an erase to
 * `{}` when the client sent nothing at all. So the fix landed on one of the two
 * doors, and editing a description by hand still quietly cleared the record
 * that makes stale art detectable.
 */

export type EntityPatch = {
  metadata?: unknown
  [key: string]: unknown
}

/**
 * Folds a patch's metadata into what the row already holds.
 *
 * Merged one level deep, which is where `image_generation` and the rest of the
 * per-entity extras live. A patch that does not mention metadata leaves the
 * column alone entirely rather than writing an empty object over it.
 */
export function normalizeEntityColumns(patch: EntityPatch, currentMetadata: unknown): Record<string, unknown> {
  const columns: Record<string, unknown> = { ...patch }
  if (!("metadata" in columns)) return columns

  const incoming = columns.metadata
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    // Nothing usable to merge. Keeping what is stored beats replacing it with
    // an empty object, which is the erase this exists to prevent.
    delete columns.metadata
    return columns
  }

  columns.metadata = mergeEntityMetadata(currentMetadata, incoming as Record<string, unknown>)
  return columns
}

export function mergeEntityMetadata(existing: unknown, patch: Record<string, unknown>) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {}
  return { ...base, ...patch }
}
