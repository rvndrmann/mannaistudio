import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandScriptInputSchema } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { normalizeScriptContent } from "@/lib/studio/script"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const input = brandScriptInputSchema.parse(await request.json())
    // Stored in the same shape the studio's Script tab reads, so a script that
    // arrives from an agent, a paste, or a hand edit all land the same way.
    const content = normalizeScriptContent(input.content ?? {})
    const { data, error } = await context.supabase
      .from("creator_brand_scripts")
      .insert({
        brand_id: brandId,
        chat_id: input.chat_id ?? null,
        title: input.title || content.title || "Untitled script",
        status: input.status,
        notes: input.notes,
        content,
      })
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ script: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid script", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the script") }, { status: studioErrorStatus(error) })
  }
}
