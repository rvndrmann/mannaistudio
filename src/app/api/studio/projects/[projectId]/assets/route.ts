import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { BytePlusProviderError, createBytePlusAsset, getBytePlusAsset } from "@/lib/studio/byteplus"
import { registerVirtualPortrait } from "@/lib/studio/private-virtual-portrait"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const createSchema = z.object({
  entityId: z.string().uuid().optional(),
  shotId: z.string().uuid().optional(),
  target: z.enum(["entity", "shot"]).default("entity"),
  targetId: z.string().uuid().optional(),
  imageUrl: z.string().max(4000).optional(),
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
    const targetEntityId = input.entityId || (input.target === "entity" ? input.targetId : undefined)
    const targetShotId = input.shotId || (input.target === "shot" ? input.targetId : undefined)

    let imagePathToResolve = input.imagePath || ""
    let resolvedUrl = input.imageUrl || ""

    if (targetShotId) {
      const { data: shot } = await context.supabase.from("creator_shots").select("id, keyframe_image, metadata").eq("id", targetShotId).maybeSingle()
      if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
      if (!imagePathToResolve && shot.keyframe_image) imagePathToResolve = shot.keyframe_image
    } else if (targetEntityId) {
      const { data: entity } = await context.supabase.from("creator_entities").select("id, reference_images, metadata").eq("id", targetEntityId).eq("project_id", projectId).maybeSingle()
      if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 })
      if (!imagePathToResolve && Array.isArray(entity.reference_images) && entity.reference_images.length > 0) {
        imagePathToResolve = entity.reference_images[0]
      }
    }

    if (imagePathToResolve && !/^https?:\/\//i.test(imagePathToResolve)) {
      const { data, error } = await context.supabase.storage
        .from("creator-studio-media")
        .createSignedUrl(imagePathToResolve, 60 * 60)
      if (error) throw error
      resolvedUrl = data.signedUrl
    }

    if (!resolvedUrl) {
      return NextResponse.json({ error: "No valid image URL or path provided for asset registration." }, { status: 400 })
    }

    // Register Private Virtual Portrait with BytePlus
    const result = await registerVirtualPortrait({ imageUrl: resolvedUrl, name: input.name || "shot_portrait" })
    const assetUri = result.assetUri

    if (targetShotId) {
      const { data: shot } = await context.supabase.from("creator_shots").select("metadata").eq("id", targetShotId).single()
      const shotMeta = (shot?.metadata as Record<string, unknown>) || {}
      await context.supabase
        .from("creator_shots")
        .update({
          is_trusted_provider_asset: true,
          provider_asset_uri: assetUri,
          metadata: {
            ...shotMeta,
            byteplus_asset_id: result.assetId,
            byteplus_asset_uri: assetUri,
            byteplus_asset_class: "private_virtual_portrait",
            verification_status: "verified",
          },
        })
        .eq("id", targetShotId)
    }

    if (targetEntityId) {
      const { data: entity } = await context.supabase.from("creator_entities").select("metadata").eq("id", targetEntityId).eq("project_id", projectId).single()
      const entityMeta = (entity?.metadata as Record<string, unknown>) || {}
      await context.supabase
        .from("creator_entities")
        .update({
          byteplus_asset_id: result.assetId,
          byteplus_asset_uri: assetUri,
          source_type: "byteplus_virtual_portrait",
          byteplus_asset_class: "private_virtual_portrait",
          verification_status: "verified",
          metadata: {
            ...entityMeta,
            byteplus_asset_id: result.assetId,
            byteplus_asset_uri: assetUri,
            byteplus_asset_class: "private_virtual_portrait",
            source_type: "byteplus_virtual_portrait",
          },
        })
        .eq("id", targetEntityId)
        .eq("project_id", projectId)
    }

    return NextResponse.json({ assetId: result.assetId, assetUri, status: "verified", byteplusAssetClass: "private_virtual_portrait" }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json(
      { error: studioErrorMessage(error, "Asset registration failed") },
      { status: error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) },
    )
  }
}
