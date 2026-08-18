import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandKnowledgeInputSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const input = brandKnowledgeInputSchema.parse(await request.json())
    const { data, error } = await context.supabase.from("creator_brand_knowledge").insert({ ...input, brand_id: brandId }).select("*").single()
    if (error) throw error
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid knowledge entry", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the knowledge entry") }, { status: studioErrorStatus(error) })
  }
}
