import type { SupabaseClient } from "@supabase/supabase-js"
import { createBytePlusAsset, getBytePlusAsset } from "./byteplus"

/**
 * The BytePlus Asset Library, remembered.
 *
 * Registration exists to clear the provider's real-person check, and it used to
 * happen on every generation: the same character sheet, the same keyframe, a new
 * asset each time — including for requests the provider then rejected. The
 * library holds 50 images for the whole account, so it filled within hours and
 * left nothing behind to say what was in it.
 *
 * A path registers once. Everything after reuses the asset it already has.
 */

export const BYTEPLUS_ASSET_LIMIT = 50

export type RegisteredAsset = {
  id: string
  source_path: string
  asset_id: string
  asset_uri: string
  name: string | null
  project_id: string | null
  entity_id: string | null
  created_at: string
  last_used_at: string
  use_count: number
}

export type ResolvedAsset = {
  assetId: string
  assetUri: string
  /** True when nothing new was created at the provider. */
  reused: boolean
}

const isActive = (status?: string | null) => status === "Active" || status === "active"

/** The live asset for an id, or null if the provider no longer has it. */
async function activeAsset(assetId: string) {
  const info = await getBytePlusAsset(assetId).catch(() => null)
  return info && isActive(info.status) ? info : null
}

/**
 * Register an image with the BytePlus Asset Library at most once.
 *
 * Every caller has to come through here. Registering is what clears the
 * provider's real-person check, and each call burns one of the account's 50
 * shared slots permanently — so a second registration of a character image the
 * account already holds is not merely wasteful, it is a slot nobody can
 * identify or reclaim later.
 *
 * Three chances to avoid the call, in order of trust:
 *  1. `knownAssetId` — an id already stored on the shot or entity by an earlier
 *     verification. Adopted into the registry when the provider confirms it.
 *  2. The registry row for this exact source path.
 *  3. Only then, create.
 *
 * `sourcePath` is the identity of the image, so it must be the stable storage
 * path (or the external URL) — never a signed URL, whose token is different on
 * every request and would defeat the lookup entirely.
 */
export async function registerAssetOnce(input: {
  supabase: SupabaseClient
  sourcePath: string
  imageUrl: string
  name?: string
  projectId?: string | null
  entityId?: string | null
  userId?: string | null
  knownAssetId?: string | null
}): Promise<ResolvedAsset> {
  const { supabase, sourcePath } = input

  const known = input.knownAssetId?.trim()
  if (known) {
    const info = await activeAsset(known)
    if (info) {
      // It exists at the provider but may predate this registry, so adopt it:
      // it occupies a slot either way and has to be accounted for.
      await recordExistingAsset({
        supabase,
        sourcePath,
        assetId: known,
        name: input.name,
        projectId: input.projectId,
        entityId: input.entityId,
        userId: input.userId,
      })
      return { assetId: known, assetUri: info.assetUri || `asset://${known}`, reused: true }
    }
  }

  const { data: existing } = await supabase
    .from("creator_byteplus_assets")
    .select("id,asset_id,asset_uri,use_count")
    .eq("source_path", sourcePath)
    .maybeSingle()

  if (existing?.asset_uri) {
    // Verify that the cached asset still exists and is active on BytePlus.
    const info = await activeAsset(existing.asset_id)
    if (info) {
      await supabase
        .from("creator_byteplus_assets")
        .update({ last_used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1 })
        .eq("id", existing.id)
      return { assetId: existing.asset_id, assetUri: info.assetUri || existing.asset_uri, reused: true }
    }
    // Asset is deleted or missing from BytePlus — remove stale registry record so it re-registers freshly.
    await supabase.from("creator_byteplus_assets").delete().eq("id", existing.id)
  }

  const created = await createBytePlusAsset({ imageUrl: input.imageUrl, name: input.name })
  let assetUri = `asset://${created.assetId}`
  // An asset is not usable the instant it is created, and the URI the provider
  // reports once it is active is the one to keep.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const info = await getBytePlusAsset(created.assetId)
    if (isActive(info.status)) {
      assetUri = info.assetUri || assetUri
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Upsert, not insert: two verifications racing on the same path would
  // otherwise fail the second write on the unique index and lose the row,
  // leaving a registered asset with nothing pointing at it.
  await supabase.from("creator_byteplus_assets").upsert({
    source_path: sourcePath,
    asset_id: created.assetId,
    asset_uri: assetUri,
    name: input.name || null,
    project_id: input.projectId || null,
    entity_id: input.entityId || null,
    created_by: input.userId || null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: "source_path" })

  return { assetId: created.assetId, assetUri, reused: false }
}

/**
 * The asset URI for an image, registering it only if it has never been
 * registered before. Returns null when registration is unavailable, so the
 * caller can fall back to sending the plain URL.
 */
export async function resolveRegisteredAsset(input: {
  supabase: SupabaseClient
  sourcePath: string
  imageUrl: string
  name?: string
  projectId?: string | null
  entityId?: string | null
  userId?: string | null
  knownAssetId?: string | null
}): Promise<string | null> {
  try {
    return (await registerAssetOnce(input)).assetUri
  } catch (error) {
    console.warn(`Could not register ${input.sourcePath} with the BytePlus Asset Library:`, error)
    return null
  }
}

/** Everything the studio has registered, most recently used last. */
export async function listRegisteredAssets(supabase: SupabaseClient): Promise<RegisteredAsset[]> {
  const { data, error } = await supabase
    .from("creator_byteplus_assets")
    .select("*")
    .order("last_used_at", { ascending: false })
  if (error) throw error
  return (data || []) as RegisteredAsset[]
}

/**
 * Records an asset that already exists at the provider — one registered before
 * this registry did, or reused from an entity's stored id.
 *
 * Those assets occupy the same 50 slots as any other, so without adopting them
 * on use the admin view would report an almost empty library while the account
 * was full.
 */
export async function recordExistingAsset(input: {
  supabase: SupabaseClient
  sourcePath: string
  assetId: string
  name?: string
  projectId?: string | null
  entityId?: string | null
  userId?: string | null
}) {
  try {
    const { data: existing } = await input.supabase
      .from("creator_byteplus_assets")
      .select("id,use_count")
      .eq("source_path", input.sourcePath)
      .maybeSingle()
    if (existing) {
      await input.supabase
        .from("creator_byteplus_assets")
        .update({ last_used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1, asset_id: input.assetId })
        .eq("id", existing.id)
      return
    }
    await input.supabase.from("creator_byteplus_assets").insert({
      source_path: input.sourcePath,
      asset_id: input.assetId,
      asset_uri: `asset://${input.assetId}`,
      name: input.name || null,
      project_id: input.projectId || null,
      entity_id: input.entityId || null,
      created_by: input.userId || null,
    })
  } catch (error) {
    // Bookkeeping must never fail a generation.
    console.warn(`Could not record the existing BytePlus asset for ${input.sourcePath}:`, error)
  }
}
