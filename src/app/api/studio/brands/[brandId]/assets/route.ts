import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandAssetInputSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const input = brandAssetInputSchema.parse(await request.json())
    if (!input.storage_path && !input.external_url) {
      return NextResponse.json({ error: "An asset needs either an uploaded file or a link." }, { status: 400 })
    }
    const { data, error } = await context.supabase.from("creator_brand_assets").insert({ ...input, brand_id: brandId }).select("*").single()
    if (error) throw error
    return NextResponse.json({ asset: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid asset", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the asset") }, { status: studioErrorStatus(error) })
  }
}
