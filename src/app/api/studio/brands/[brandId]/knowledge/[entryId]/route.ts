import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandKnowledgeInputSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string; entryId: string }> }) {
  try {
    const { brandId, entryId } = await params
    const context = await requireBrandOwner(brandId)
    const patch = brandKnowledgeInputSchema.partial().parse(await request.json())
    const { data, error } = await context.supabase.from("creator_brand_knowledge").update(patch).eq("id", entryId).eq("brand_id", brandId).select("*").single()
    if (error) throw error
    return NextResponse.json({ entry: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid knowledge entry", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the knowledge entry") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string; entryId: string }> }) {
  try {
    const { brandId, entryId } = await params
    const context = await requireBrandOwner(brandId)
    const { error } = await context.supabase.from("creator_brand_knowledge").delete().eq("id", entryId).eq("brand_id", brandId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the knowledge entry") }, { status: studioErrorStatus(error) })
  }
}
