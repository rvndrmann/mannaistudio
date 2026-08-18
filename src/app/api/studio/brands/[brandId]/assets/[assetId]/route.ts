import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandAssetInputSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  try {
    const { brandId, assetId } = await params
    const context = await requireBrandOwner(brandId)
    const patch = brandAssetInputSchema.partial().parse(await request.json())
    const { data, error } = await context.supabase.from("creator_brand_assets").update(patch).eq("id", assetId).eq("brand_id", brandId).select("*").single()
    if (error) throw error
    return NextResponse.json({ asset: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid asset", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the asset") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  try {
    const { brandId, assetId } = await params
    const context = await requireBrandOwner(brandId)
    const { data: asset } = await context.supabase.from("creator_brand_assets").select("storage_path").eq("id", assetId).eq("brand_id", brandId).maybeSingle()
    const { error } = await context.supabase.from("creator_brand_assets").delete().eq("id", assetId).eq("brand_id", brandId)
    if (error) throw error
    // The row is what the library reads, so a failed file removal leaves an
    // orphan in the bucket rather than an asset the user cannot get rid of.
    if (asset?.storage_path) {
      const { error: storageError } = await context.supabase.storage.from("creator-studio-media").remove([asset.storage_path])
      if (storageError) console.warn("Could not remove brand asset file:", storageError.message)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the asset") }, { status: studioErrorStatus(error) })
  }
}
