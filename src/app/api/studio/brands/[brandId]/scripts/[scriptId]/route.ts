import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandScriptPatchSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { normalizeScriptContent } from "@/lib/studio/script"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string; scriptId: string }> }) {
  try {
    const { brandId, scriptId } = await params
    const context = await requireBrandOwner(brandId)
    const patch = brandScriptPatchSchema.parse(await request.json())
    const { data, error } = await context.supabase
      .from("creator_brand_scripts")
      .update({
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.notes === undefined ? {} : { notes: patch.notes }),
        ...(patch.content === undefined ? {} : { content: normalizeScriptContent(patch.content) }),
      })
      .eq("id", scriptId).eq("brand_id", brandId)
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ script: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid script", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the script") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string; scriptId: string }> }) {
  try {
    const { brandId, scriptId } = await params
    const context = await requireBrandOwner(brandId)
    const { error } = await context.supabase.from("creator_brand_scripts").delete().eq("id", scriptId).eq("brand_id", brandId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the script") }, { status: studioErrorStatus(error) })
  }
}
