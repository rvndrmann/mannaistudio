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
}): Promise<string | null> {
  const { supabase, sourcePath } = input
  try {
    const { data: existing } = await supabase
      .from("creator_byteplus_assets")
      .select("id,asset_id,asset_uri,use_count")
      .eq("source_path", sourcePath)
      .maybeSingle()

    if (existing?.asset_uri) {
      // Touched rather than re-registered: last_used_at is what tells an admin
      // which assets are dead weight when the quota needs freeing.
      await supabase
        .from("creator_byteplus_assets")
        .update({ last_used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1 })
        .eq("id", existing.id)
      return existing.asset_uri
    }

    const created = await createBytePlusAsset({ imageUrl: input.imageUrl, name: input.name })
    let assetUri = `asset://${created.assetId}`
    // An asset is not usable the instant it is created, and the URI the provider
    // reports once it is active is the one to keep.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const info = await getBytePlusAsset(created.assetId)
      if (info.status === "Active" || info.status === "active") {
        assetUri = info.assetUri || assetUri
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    await supabase.from("creator_byteplus_assets").insert({
      source_path: sourcePath,
      asset_id: created.assetId,
      asset_uri: assetUri,
      name: input.name || null,
      project_id: input.projectId || null,
      entity_id: input.entityId || null,
      created_by: input.userId || null,
    })
    return assetUri
  } catch (error) {
    console.warn(`Could not register ${sourcePath} with the BytePlus Asset Library:`, error)
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
