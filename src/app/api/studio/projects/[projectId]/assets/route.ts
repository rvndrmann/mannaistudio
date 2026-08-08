import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { BytePlusProviderError, createBytePlusAsset, getBytePlusAsset } from "@/lib/studio/byteplus"
import { registerVirtualPortrait } from "@/lib/studio/private-virtual-portrait"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const createSchema = z.object({
  entityId: z.string().uuid(),
  imageUrl: z.string().max(4000),
  imagePath: z.string().max(2000).optional(),
  name: z.string().max(200).optional(),
}).strict()

const statusSchema = z.object({
  assetId: z.string().max(200),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const body = await request.json()

    // Check if this is a status check or a new asset creation
    if (body.assetId) {
      const input = statusSchema.parse(body)
      const asset = await getBytePlusAsset(input.assetId)
      return NextResponse.json(asset)
    }

    const input = createSchema.parse(body)

    // Verify the entity belongs to this project
    const { data: entity } = await context.supabase
      .from("creator_entities")
      .select("id, metadata")
      .eq("id", input.entityId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 })

    // If imagePath is a Supabase storage path, create a signed URL
    let resolvedUrl = input.imageUrl
    if (input.imagePath && !/^https?:\/\//i.test(input.imagePath)) {
      const { data, error } = await context.supabase.storage
        .from("creator-studio-media")
        .createSignedUrl(input.imagePath, 60 * 60)
      if (error) throw error
      resolvedUrl = data.signedUrl
    }

    // Register Private Virtual Portrait with BytePlus
    const result = await registerVirtualPortrait({ imageUrl: resolvedUrl, name: input.name })
    const assetUri = result.assetUri

    // Save asset ID, URI, source_type and byteplus_asset_class to entity metadata and database columns
    const metadata = {
      ...(entity.metadata || {}),
      byteplus_asset_id: result.assetId,
      byteplus_asset_uri: assetUri,
      byteplus_asset_class: "private_virtual_portrait",
      source_type: "byteplus_virtual_portrait",
    } as Record<string, unknown>

    await context.supabase
      .from("creator_entities")
      .update({
        byteplus_asset_id: result.assetId,
        byteplus_asset_uri: assetUri,
        source_type: "byteplus_virtual_portrait",
        byteplus_asset_class: "private_virtual_portrait",
        verification_status: "verified",
        metadata,
      })
      .eq("id", input.entityId)
      .eq("project_id", projectId)

    return NextResponse.json({ assetId: result.assetId, assetUri, status: "verified", byteplusAssetClass: "private_virtual_portrait" }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json(
      { error: studioErrorMessage(error, "Asset registration failed") },
      { status: error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) },
    )
  }
}
