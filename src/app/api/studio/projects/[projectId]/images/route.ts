import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { generateOpenAIImage, openAIImageModels, OpenAIProviderError } from "@/lib/studio/openai"
import { createBytePlusAsset, generateBytePlusImage, BytePlusProviderError } from "@/lib/studio/byteplus"
import { FalProviderError, generateFalImage } from "@/lib/studio/fal"
import { generateGoogleImage, GoogleProviderError } from "@/lib/studio/google"
import { generationProvider, isImageGenerationModel, type ImageGenerationModelId } from "@/lib/studio/generation-models"
import { calculateCreditCost, deductUserCredits } from "@/lib/studio/credits"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { buildEntityMentionContext, type MentionableEntity } from "@/lib/studio/entity-mentions"

const imageRequestSchema = z.object({
  target: z.enum(["asset", "shot"]),
  targetId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  model: z.string().refine(isImageGenerationModel, "Unsupported image model"),
  referenceImages: z.array(z.string().max(2_000)).max(8).default([]),
  mentionedEntityIds: z.array(z.string().uuid()).max(20).default([]),
  aspectRatio: z.string().max(20).optional(),
  quality: z.enum(["Low", "Medium", "High", "Ultra"]).optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = imageRequestSchema.parse(await request.json())
    const provider = generationProvider(input.model)

    let shotData: Record<string, unknown> | null = null
    if (input.target === "asset") {
      const { data } = await context.supabase.from("creator_entities").select("id, reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    } else {
      const { data } = await context.supabase.from("creator_shots").select("id, episode_id, metadata, referenced_entities").eq("id", input.targetId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
      shotData = data
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", data.episode_id).eq("project_id", projectId).maybeSingle()
      if (!episode) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
    }

    const { data: mentionedEntities, error: mentionedEntityError } = input.mentionedEntityIds.length
      ? await context.supabase
        .from("creator_entities")
        .select("id,name,type,description,reference_images,metadata")
        .eq("project_id", projectId)
        .in("id", input.mentionedEntityIds)
      : { data: [], error: null }
    if (mentionedEntityError) throw mentionedEntityError
    if ((mentionedEntities || []).length !== new Set(input.mentionedEntityIds).size) {
      return NextResponse.json({ error: "One or more mentioned entities do not belong to this project." }, { status: 400 })
    }

    // Validate the full request before reserving credits.
    const creditCost = calculateCreditCost(input.model, "image", 5, { quality: input.quality, aspectRatio: input.aspectRatio })
    const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Image Generation (${input.model})`, context.supabase)
    if (!deduct.success) {
      return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
    }

    const mentionReferencePaths: string[] = []
    for (const entity of mentionedEntities || []) {
      const metadata = entity.metadata && typeof entity.metadata === "object" ? entity.metadata as Record<string, unknown> : {}
      const byteplusAssetId = typeof metadata.byteplus_asset_id === "string" ? metadata.byteplus_asset_id.trim() : ""
      if (provider === "byteplus" && byteplusAssetId) mentionReferencePaths.push(byteplusAssetId)
      else if (Array.isArray(entity.reference_images)) mentionReferencePaths.push(...entity.reference_images.filter((path): path is string => typeof path === "string" && Boolean(path.trim())))
    }
    const combinedReferencePaths = Array.from(new Set([...mentionReferencePaths, ...input.referenceImages])).slice(0, 8)
    const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])
    const resolvedPrompt = mentionContext ? `${input.prompt}\n\n${mentionContext}` : input.prompt
    const referenceUrls: string[] = []
    for (const reference of combinedReferencePaths) {
      if (/^https?:\/\//i.test(reference) || /^asset:\/\//i.test(reference) || /^asset-[a-z0-9-]+$/i.test(reference)) referenceUrls.push(reference)
      else {
        const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(reference, 60 * 60)
        if (error) throw error
        referenceUrls.push(data.signedUrl)
      }
    }
    let image: Buffer
    let contentType = "image/png"
    let byteplusAssetId: string | null = null
    let byteplusAssetUri: string | null = null

    if (provider === "openai") {
      image = await generateOpenAIImage({ userId: context.user.id, model: input.model as (typeof openAIImageModels)[number], prompt: resolvedPrompt, referenceUrls })
    } else if (provider === "fal") {
      const generated = await generateFalImage({ model: input.model as ImageGenerationModelId, prompt: resolvedPrompt, referenceUrls })
      const download = await fetch(generated.url)
      if (!download.ok) throw new FalProviderError(`Could not download fal.ai output (${download.status}).`)
      image = Buffer.from(await download.arrayBuffer())
      contentType = generated.contentType
    } else if (provider === "google") {
      const generated = await generateGoogleImage({ model: input.model as ImageGenerationModelId, prompt: resolvedPrompt, referenceUrls })
      const download = await fetch(generated.url)
      if (!download.ok) throw new GoogleProviderError(`Could not download Google AI Studio output (${download.status}).`)
      image = Buffer.from(await download.arrayBuffer())
      contentType = generated.contentType
    } else {
      const generated = await generateBytePlusImage({ model: input.model, prompt: resolvedPrompt, referenceUrls })
      // Auto-register Seedream output into BytePlus ModelArk Asset Library to preserve provider trust
      try {
        const assetRes = await createBytePlusAsset({ imageUrl: generated.url, name: input.prompt.slice(0, 50) })
        byteplusAssetId = assetRes.assetId
        byteplusAssetUri = `asset://${assetRes.assetId}`
      } catch (assetErr) {
        console.warn("Could not auto-register Seedream output as BytePlus asset:", assetErr)
      }
      const download = await fetch(generated.url)
      if (!download.ok) throw new BytePlusProviderError(`Could not download Seedream output (${download.status}).`)
      image = Buffer.from(await download.arrayBuffer())
      contentType = generated.contentType
    }
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png"
    const storagePath = `${context.user.id}/${projectId}/${provider}-image-${randomUUID()}.${extension}`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, image, { contentType, upsert: false })
    if (uploadError) throw uploadError

    // Auto-register generated image as BytePlus Asset Library asset if management keys are set
    if (!byteplusAssetId && process.env.ARK_ACCESS_KEY && process.env.ARK_SECRET_KEY) {
      try {
        const { data: signed } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(storagePath, 60 * 60)
        if (signed?.signedUrl) {
          const assetRes = await createBytePlusAsset({ imageUrl: signed.signedUrl, name: input.prompt.slice(0, 50) })
          byteplusAssetId = assetRes.assetId
          byteplusAssetUri = `asset://${assetRes.assetId}`
        }
      } catch (assetErr) {
        console.warn("Could not auto-register shot image to BytePlus Asset Library:", assetErr)
      }
    }

    if (input.target === "asset") {
      const { data: asset, error: readError } = await context.supabase.from("creator_entities").select("reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).single()
      if (readError) throw readError
      const currentMeta = (asset.metadata as Record<string, unknown>) || {}
      const metadata = {
        ...currentMeta,
        ...(byteplusAssetId ? { byteplus_asset_id: byteplusAssetId } : {}),
        image_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, reference_images: combinedReferencePaths, mentioned_entity_ids: input.mentionedEntityIds, status: "completed", completed_at: new Date().toISOString() },
      }
      const updates: Record<string, unknown> = {
        reference_images: [...(asset.reference_images || []), storagePath],
        metadata,
        status: "draft",
      }
      if (byteplusAssetId) updates.byteplus_asset_id = byteplusAssetId
      if (byteplusAssetUri) updates.byteplus_asset_uri = byteplusAssetUri
      if (byteplusAssetId) updates.verification_status = "verified"
      const { error } = await context.supabase.from("creator_entities").update(updates).eq("id", input.targetId).eq("project_id", projectId)
      if (error) throw error
    } else {
      const currentMeta = ((shotData?.metadata as Record<string, unknown>) || {})
      const currentReferencedEntities = Array.isArray(shotData?.referenced_entities) ? shotData.referenced_entities.filter((id): id is string => typeof id === "string") : []
      const { error } = await context.supabase.from("creator_shots").update({
        keyframe_image: storagePath,
        referenced_entities: Array.from(new Set([...currentReferencedEntities, ...input.mentionedEntityIds])),
        is_trusted_provider_asset: Boolean(byteplusAssetUri),
        provider_asset_uri: byteplusAssetUri || null,
        metadata: {
          ...currentMeta,
          ...(byteplusAssetId ? { byteplus_asset_id: byteplusAssetId } : {}),
          image_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, reference_images: combinedReferencePaths, mentioned_entity_ids: input.mentionedEntityIds, status: "completed", completed_at: new Date().toISOString() },
        },
      }).eq("id", input.targetId)
      if (error) throw error

      // Record in creator_generation_jobs so history displays prompt and model
      await context.supabase.from("creator_generation_jobs").insert({
        project_id: projectId,
        episode_id: typeof shotData?.episode_id === "string" ? shotData.episode_id : null,
        shot_id: input.targetId,
        provider,
        model: input.model,
        prompt: input.prompt,
        input_images: combinedReferencePaths,
        status: "completed",
        result_url: storagePath,
      })
    }
    return NextResponse.json({ path: storagePath, provider, model: input.model, byteplusAssetId, byteplusAssetUri })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Image generation failed") }, { status: error instanceof OpenAIProviderError || error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) })
  }
}
