import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteBytePlusAsset } from "@/lib/studio/byteplus"
import { BYTEPLUS_ASSET_LIMIT, listRegisteredAssets } from "@/lib/studio/byteplus-assets"
import { describeError } from "@/lib/studio/errors"

/**
 * The Asset Library as the studio knows it: what was registered, when it was
 * last needed, and how much of the account's 50-image quota is gone.
 *
 * The provider has no list call we can rely on, so this reports the studio's own
 * record — which is what fills the quota in the first place.
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) }
  const { data: admin } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle()
  if (!admin) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) }
  return { supabase }
}


/**
 * Forgets a deleted asset everywhere it is referenced, without touching the
 * image.
 *
 * An entity or shot keeps the provider's asset id so later jobs can send
 * `asset://…` instead of a raw URL. Once that asset is deleted the id is a
 * dangling pointer, and generation fails on it rather than simply registering
 * again. Only the pointer is removed: reference_images, keyframes and the files
 * in storage are all left exactly as they were.
 */
async function clearAssetPointers(supabase: Awaited<ReturnType<typeof createClient>>, assetId: string) {
  let cleared = 0
  const stripKeys = (value: unknown) => {
    const metadata = value && typeof value === "object" ? { ...value as Record<string, unknown> } : {}
    delete metadata.byteplus_asset_id
    delete metadata.byteplus_asset_uri
    delete metadata.byteplus_asset_class
    return metadata
  }

  try {
    const { data: entities } = await supabase
      .from("creator_entities")
      .select("id,metadata")
      .eq("metadata->>byteplus_asset_id", assetId)
    for (const entity of entities || []) {
      await supabase
        .from("creator_entities")
        .update({ metadata: stripKeys(entity.metadata), byteplus_asset_id: null, byteplus_asset_uri: null })
        .eq("id", entity.id)
      cleared += 1
    }
  } catch (error) {
    console.warn("Could not clear entity asset pointers:", error)
  }

  try {
    const { data: shots } = await supabase
      .from("creator_shots")
      .select("id,metadata")
      .eq("metadata->>byteplus_asset_id", assetId)
    for (const shot of shots || []) {
      await supabase
        .from("creator_shots")
        .update({ metadata: stripKeys(shot.metadata), is_trusted_provider_asset: false, provider_asset_uri: null })
        .eq("id", shot.id)
      cleared += 1
    }
  } catch (error) {
    console.warn("Could not clear shot asset pointers:", error)
  }

  return cleared
}

export async function GET() {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error
    const assets = await listRegisteredAssets(gate.supabase!)
    return NextResponse.json({ assets, used: assets.length, limit: BYTEPLUS_ASSET_LIMIT })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not read the asset library") }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error
    const supabase = gate.supabase!
    const { id } = await request.json() as { id?: string }
    if (!id) return NextResponse.json({ error: "Which asset?" }, { status: 400 })

    const { data: asset } = await supabase.from("creator_byteplus_assets").select("id,asset_id").eq("id", id).maybeSingle()
    if (!asset) return NextResponse.json({ error: "That asset is not in the registry" }, { status: 404 })

    // The provider's copy is what counts against the quota, so it goes first.
    // Dropping our row on its own would free nothing and hide that it had not.
    await deleteBytePlusAsset(asset.asset_id)
    // Whatever still points at the freed asset must stop pointing at it, or the
    // next generation sends an id the provider no longer has. The image itself
    // is untouched — it stays in storage and on its card, and re-registers by
    // itself the next time a Seedance job needs it.
    const cleared = await clearAssetPointers(supabase, asset.asset_id)
    const { error } = await supabase.from("creator_byteplus_assets").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ deleted: id, clearedPointers: cleared })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not delete the asset") }, { status: 500 })
  }
}
