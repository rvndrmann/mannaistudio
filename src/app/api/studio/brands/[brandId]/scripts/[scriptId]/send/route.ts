import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { BrandHandoffError, sendBrandScriptToProject } from "@/lib/studio/brand-handoff"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const sendSchema = z.object({
  // Omitted means "start a new production for this script".
  projectId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
  projectName: z.string().trim().min(1).max(160).optional(),
  importAssets: z.boolean().default(true),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string; scriptId: string }> }) {
  try {
    const { brandId, scriptId } = await params
    const context = await requireBrandOwner(brandId)
    const input = sendSchema.parse(await request.json().catch(() => ({})))

    const { data: script } = await context.supabase.from("creator_brand_scripts").select("*").eq("id", scriptId).eq("brand_id", brandId).maybeSingle()
    if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })

    const handoff = await sendBrandScriptToProject({
      supabase: context.supabase,
      user: context.user,
      brand: context.brand,
      script: { id: script.id, title: script.title, content: script.content, notes: script.notes },
      projectId: input.projectId,
      episodeId: input.episodeId,
      projectName: input.projectName,
      importAssets: input.importAssets,
    })

    const { data: sentScript, error: markError } = await context.supabase
      .from("creator_brand_scripts")
      .update({ status: "final", sent_project_id: handoff.projectId, sent_episode_id: handoff.episodeId, sent_at: new Date().toISOString() })
      .eq("id", scriptId).eq("brand_id", brandId)
      .select("*")
      .single()
    if (markError) throw markError

    return NextResponse.json({ script: sentScript, projectId: handoff.projectId, episodeId: handoff.episodeId, importedEntities: handoff.importedEntities })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid handoff", issues: error.flatten() }, { status: 400 })
    if (error instanceof BrandHandoffError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not send the script to production") }, { status: studioErrorStatus(error) })
  }
}
