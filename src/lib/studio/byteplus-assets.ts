import type { SupabaseClient } from "@supabase/supabase-js"
import { createBytePlusAsset, getBytePlusAsset } from "./byteplus"
import { createServiceClient } from "@/lib/supabase/service"

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

const ASSET_ACTIVATION_ATTEMPTS = 10

/** Wait briefly for a newly-created library asset before treating it as usable. */
async function waitForActiveAsset(assetId: string) {
  let latest: Awaited<ReturnType<typeof getBytePlusAsset>> | null = null
  for (let attempt = 0; attempt < ASSET_ACTIVATION_ATTEMPTS; attempt += 1) {
    try {
      latest = await getBytePlusAsset(assetId)
    } catch {
      // A missing/deleted asset cannot become active by waiting. Let the caller
      // replace its stale registry entry immediately.
      return null
    }
    if (latest && isActive(latest.status)) return latest
    if (attempt < ASSET_ACTIVATION_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return latest
}

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
/**
 * Writes the registry row for an image that has just been registered.
 *
 * This was an upsert naming `source_path` as its conflict target, and there is
 * no unique constraint by that name — the index is on `(source_path,
 * coalesce(credential_id, ...))`, so a customer's key and the platform's can
 * each hold the same picture. Postgres rejects an ON CONFLICT that matches no
 * constraint, the result was never inspected, and so every registration since
 * has been silently forgotten: the asset was created at the provider, nothing
 * recorded it, and the next generation registered the same face again. That is
 * the fifty-image library filling up, and a character that verifies
 * successfully and is rejected anyway.
 *
 * Insert first, update on collision, and never ignore either error. The
 * collision path is what the upsert was reaching for — two verifications racing
 * on one image must not lose the row — and it is kept.
 */
/** Where the studio's one shared asset group id is kept between processes. */
const ASSET_GROUP_SETTING = "byteplus_asset_group_id"

/**
 * The asset group every registration should go into.
 *
 * The provider requires a group and the id was held in a module variable, which
 * on a serverless host is per invocation and on a dev machine is per restart —
 * so "one group for the whole studio" became a new group per registration. That
 * is twenty-eight groups holding the same few faces, and an account at 42 of its
 * 50 assets with nothing to show for it.
 *
 * Kept in the database instead, which is the only thing here that outlives a
 * process. A group named in the environment still wins: an operator pointing at
 * a specific group is being deliberate, and that must not be overridden by
 * something this created earlier.
 */
export async function sharedAssetGroupId(supabase: SupabaseClient): Promise<string | undefined> {
  const fromEnv = process.env.ARK_ASSET_GROUP_ID?.trim()
  if (fromEnv) return fromEnv
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", ASSET_GROUP_SETTING)
    .maybeSingle()
  const stored = (data?.value as { group_id?: unknown } | null)?.group_id
  return typeof stored === "string" && stored.trim() ? stored.trim() : undefined
}

/** Remembers a group the provider just made, so the next process reuses it. */
export async function rememberAssetGroupId(supabase: SupabaseClient, groupId: string) {
  // This is server-owned provider configuration. The request client correctly
  // cannot write site_settings under RLS, so use the service client after the
  // route has already authenticated project access.
  let settingsClient = supabase
  try { settingsClient = createServiceClient() } catch { /* tests/local setups without a service key */ }
  const { error } = await settingsClient
    .from("site_settings")
    .upsert({ key: ASSET_GROUP_SETTING, value: { group_id: groupId } }, { onConflict: "key" })
  if (error) console.warn("Could not remember the BytePlus asset group id:", error.message)
}

async function forgetAssetGroupId(supabase: SupabaseClient) {
  let settingsClient = supabase
  try { settingsClient = createServiceClient() } catch { /* tests/local setups without a service key */ }
  const { error } = await settingsClient
    .from("site_settings")
    .upsert({ key: ASSET_GROUP_SETTING, value: { group_id: null } }, { onConflict: "key" })
  if (error) throw new Error(`Could not clear the missing BytePlus asset group: ${error.message}`)
}

async function rememberRegistration(supabase: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await supabase.from("creator_byteplus_assets").insert(row)
  if (!error) return
  // 23505 is a unique violation: someone else registered this image between
  // the lookup above and this write.
  if (error.code !== "23505") {
    throw new Error(`Registered ${row.asset_id} with the provider but could not record it: ${error.message}`)
  }
  const { error: updateError } = await supabase
    .from("creator_byteplus_assets")
    .update(row)
    .eq("source_path", row.source_path as string)
  if (updateError) {
    throw new Error(`Registered ${row.asset_id} with the provider but could not record it: ${updateError.message}`)
  }
}

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
    // Only if this asset is not already the registration of some other image.
    //
    // The id is handed in from whatever the entity or shot happens to have
    // stored, and that stays behind when the picture changes: swap a
    // character's chosen image and the entity still points at the asset made
    // from the previous one. Adopting it registered nothing, wrote the new
    // path against the old asset, and reported success — so "Verify for
    // Seedance" appeared to work, the image never reached the Asset Library,
    // and the provider went on rejecting it. Worse, the false row then looked
    // like a valid registration, so every later attempt reused it too and the
    // character could never be verified again.
    const { data: claimedByAnother } = await supabase
      .from("creator_byteplus_assets")
      .select("source_path")
      .eq("asset_id", known)
      .neq("source_path", sourcePath)
      .maybeSingle()
    const info = claimedByAnother ? null : await waitForActiveAsset(known)
    if (info && isActive(info.status)) {
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
    if (info) {
      throw new Error("Seedance is still processing this verified image. Please try again in a moment.")
    }
  }

  const { data: existing } = await supabase
    .from("creator_byteplus_assets")
    .select("id,asset_id,asset_uri,use_count")
    .eq("source_path", sourcePath)
    .maybeSingle()

  if (existing?.asset_uri) {
    // Verify that the cached asset still exists and is active on BytePlus.
    const info = await waitForActiveAsset(existing.asset_id)
    if (info && isActive(info.status)) {
      await supabase
        .from("creator_byteplus_assets")
        .update({ last_used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1 })
        .eq("id", existing.id)
      return { assetId: existing.asset_id, assetUri: info.assetUri || existing.asset_uri, reused: true }
    }
    // Do not turn a still-processing verification into another registration.
    // A second asset burns another one of the provider's scarce library slots
    // and leaves the original Verify action looking successful but unusable.
    if (info) {
      throw new Error("Seedance is still processing this verified image. Please try again in a moment.")
    }
    // Asset is deleted or missing from BytePlus — remove stale registry record so it re-registers freshly.
    await supabase.from("creator_byteplus_assets").delete().eq("id", existing.id)
  }

  // The group is resolved here rather than inside the provider call, because
  // only this side can remember it: the provider module has no database.
  const groupId = await sharedAssetGroupId(supabase)
  let created
  try {
    created = await createBytePlusAsset({ imageUrl: input.imageUrl, name: input.name, groupId })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const missingStoredGroup = Boolean(groupId) && /asset[_ ]group.+not found|specified asset_group.+not found/i.test(message)
    // The operator-owned environment setting is deliberate and cannot safely
    // be rewritten here. A database-owned group, however, may have been removed
    // during console cleanup; recover once by replacing that dead shared group.
    if (!missingStoredGroup || process.env.ARK_ASSET_GROUP_ID?.trim()) throw error
    await forgetAssetGroupId(supabase)
    created = await createBytePlusAsset({ imageUrl: input.imageUrl, name: input.name })
  }
  if ((!groupId || created.groupId !== groupId) && created.groupId) {
    await rememberAssetGroupId(supabase, created.groupId)
  }
  let assetUri = `asset://${created.assetId}`
  // An asset is not usable the instant it is created, and the URI the provider
  // reports once it is active is the one to keep.
  const activated = await waitForActiveAsset(created.assetId)
  if (activated && isActive(activated.status)) assetUri = activated.assetUri || assetUri

  await rememberRegistration(supabase, {
    source_path: sourcePath,
    asset_id: created.assetId,
    asset_uri: assetUri,
    name: input.name || null,
    project_id: input.projectId || null,
    entity_id: input.entityId || null,
    created_by: input.userId || null,
    last_used_at: new Date().toISOString(),
  })

  if (!activated || !isActive(activated.status)) {
    throw new Error("Seedance is still processing this verified image. Please try again in a moment.")
  }

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
