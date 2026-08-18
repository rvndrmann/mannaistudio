import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandPatchSchema } from "@/lib/studio/brand"
import { loadBrandWorkspace, requireBrand, requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrand(brandId)
    const workspace = await loadBrandWorkspace(context)
    return NextResponse.json({ ...workspace, canEdit: context.brand.user_id === context.user.id })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load this brand") }, { status: studioErrorStatus(error) })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const patch = brandPatchSchema.parse(await request.json())
    const { data, error } = await context.supabase.from("creator_brands").update(patch).eq("id", brandId).select("*").single()
    if (error) throw error
    return NextResponse.json({ brand: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid brand details", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the brand") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const { error } = await context.supabase.from("creator_brands").delete().eq("id", brandId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the brand") }, { status: studioErrorStatus(error) })
  }
}
