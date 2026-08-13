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
    const { error } = await supabase.from("creator_byteplus_assets").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ deleted: id })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not delete the asset") }, { status: 500 })
  }
}
