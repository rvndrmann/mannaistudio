import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { UNVERIFIED_ASSET } from "@/lib/studio/asset-verification"

const createEntitySchema = z.object({
  type: z.enum(["character", "scene", "prop"]).default("character"),
  name: z.string().trim().min(1).max(100),
  handle: z.string().trim().min(1).max(50),
  description: z.string().trim().max(1000).nullable().optional(),
  reference_images: z.array(z.string().max(2000)).default([]),
  voice_id: z.string().trim().max(100).nullable().optional(),
  character_type: z.string().max(50).optional(),
  source_type: z.string().max(50).optional(),
  byteplus_asset_class: z.string().max(50).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)

    const { data: entities, error } = await context.supabase
      .from("creator_entities")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })

    if (error) throw error

    return NextResponse.json({ entities: entities || [] })
  } catch (error) {
    return NextResponse.json(
      { error: studioErrorMessage(error, "Failed to fetch project entities") },
      { status: studioErrorStatus(error) }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const body = await request.json()
    const input = createEntitySchema.parse(body)

    // Ensure handle starts with @ or sanitize
    const cleanHandle = input.handle.startsWith("@") ? input.handle : `@${input.handle}`

    const { data: entity, error } = await context.supabase
      .from("creator_entities")
      .insert({
        project_id: projectId,
        type: input.type,
        name: input.name,
        handle: cleanHandle,
        description: input.description || null,
        reference_images: input.reference_images,
        voice_id: input.voice_id || null,
        character_type: input.character_type || "ai_human",
        // A new entity has registered nothing yet, so it starts untrusted.
        source_type: input.source_type || UNVERIFIED_ASSET.source_type,
        byteplus_asset_class: input.byteplus_asset_class || UNVERIFIED_ASSET.byteplus_asset_class,
        provenance: input.provenance || {},
        metadata: input.metadata,
      })
      .select("*")
      .single()

    if (error) throw error

    return NextResponse.json({ entity }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid entity data", issues: error.flatten() }, { status: 400 })
    }
    return NextResponse.json(
      { error: studioErrorMessage(error, "Failed to create entity") },
      { status: studioErrorStatus(error) }
    )
  }
}
