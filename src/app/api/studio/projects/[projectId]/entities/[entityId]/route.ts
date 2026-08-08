import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const updateEntitySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  handle: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  reference_images: z.array(z.string().max(2000)).optional(),
  voice_id: z.string().trim().max(100).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict()

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; entityId: string }> }
) {
  try {
    const { projectId, entityId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const body = await request.json()
    const input = updateEntitySchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.handle !== undefined) {
      updateData.handle = input.handle.startsWith("@") ? input.handle : `@${input.handle}`
    }
    if (input.description !== undefined) updateData.description = input.description
    if (input.reference_images !== undefined) updateData.reference_images = input.reference_images
    if (input.voice_id !== undefined) updateData.voice_id = input.voice_id
    if (input.metadata !== undefined) updateData.metadata = input.metadata

    const { data: entity, error } = await context.supabase
      .from("creator_entities")
      .update(updateData)
      .eq("id", entityId)
      .eq("project_id", projectId)
      .select("*")
      .single()

    if (error) throw error
    if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 })

    return NextResponse.json({ entity })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid entity data", issues: error.flatten() }, { status: 400 })
    }
    return NextResponse.json(
      { error: studioErrorMessage(error, "Failed to update entity") },
      { status: studioErrorStatus(error) }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; entityId: string }> }
) {
  try {
    const { projectId, entityId } = await params
    const context = await requireAuthenticatedProject(projectId)

    const { error } = await context.supabase
      .from("creator_entities")
      .delete()
      .eq("id", entityId)
      .eq("project_id", projectId)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: studioErrorMessage(error, "Failed to delete entity") },
      { status: studioErrorStatus(error) }
    )
  }
}
