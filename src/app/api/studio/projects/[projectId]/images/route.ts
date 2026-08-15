import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { generateOpenAIImage, openAIImageModels, OpenAIProviderError } from "@/lib/studio/openai"
import { createBytePlusAsset, generateBytePlusImage, BytePlusProviderError } from "@/lib/studio/byteplus"
import { FalProviderError, generateFalImage } from "@/lib/studio/fal"
import { generateGoogleImage, GoogleProviderError } from "@/lib/studio/google"
import { generationProvider, isImageGenerationModel, type ImageGenerationModelId } from "@/lib/studio/generation-models"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { buildEntityMentionContext, entityPrimaryReference, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { openAIImageQuality, projectImageQuality, projectVisualStyle, visualStyleDirective } from "@/lib/studio/entity-image-workflow"
import { stripIdentityDescriptions } from "@/lib/studio/prompt-sanitizer"
import { applyCameraSettings, cameraBlockForEntityType, projectCameraDefaults, resolveCameraSettings } from "@/lib/studio/camera-settings"
import { composeLookDirectives, MAX_STYLE_REFERENCE_IMAGES, projectStyleDna, resolveStyleDna, styleBlockForEntityType, styleDnaSchema, styleReferenceClause, styleReferenceImagesOf } from "@/lib/studio/style-dna"
import { recordExistingAsset } from "@/lib/studio/byteplus-assets"
import { VERIFIED_ASSET } from "@/lib/studio/asset-verification"

const imageRequestSchema = z.object({
  target: z.enum(["asset", "shot"]),
  targetId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  model: z.string().refine(isImageGenerationModel, "Unsupported image model"),
  referenceImages: z.array(z.string().max(2_000)).max(8).default([]),
  mentionedEntityIds: z.array(z.string().uuid()).max(20).default([]),
  aspectRatio: z.string().max(20).optional(),
  quality: z.enum(["Low", "Medium", "High", "Ultra"]).optional(),
  // Which episode the request came from. A shot names its own episode, but
  // character and asset art does not, so without this its credits belong to no
  // episode and go missing from every per-episode total.
  episodeId: z.string().uuid().optional(),
  // The camera package this one image is shot on. Omitted means "whatever the
  // block resolves to" — the caller never has to send it, and an unknown value
  // is repaired against the project package rather than reaching the model.
  cameraSettings: z.object({
    camera: z.string().trim().max(120),
    lens: z.string().trim().max(120),
    focalLength: z.number(),
    aperture: z.string().trim().max(20),
  }).optional(),
  // The look this one image is shot under. Absent means "whatever the project
  // says"; explicit null means this image deliberately has no look, which is
  // not the same thing and must not fall back to the project's.
  styleDna: styleDnaSchema.nullish(),
  // A draw-to-edit request: the image the user drew on, the flattened picture
  // actually sent, and the marks themselves. Stored so the edit can be
  // reopened and adjusted instead of redrawn — and so a wrong result can be
  // traced to a bad drawing rather than blamed on the model.
  drawEdit: z.object({
    sourceImage: z.string().max(2_000),
    compositeImage: z.string().max(2_000),
    objects: z.array(z.unknown()).max(500),
  }).optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  let pendingAssetGeneration: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; projectId: string; entityId: string } | null = null
  let pendingRefund: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; amount: number; key: string; jobId: string | null } | null = null
  let pendingGenerationJobId: string | null = null
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = imageRequestSchema.parse(await request.json())
    const provider = generationProvider(input.model)

    let shotData: Record<string, unknown> | null = null
    let assetData: Record<string, unknown> | null = null
    if (input.target === "asset") {
      const { data } = await context.supabase.from("creator_entities").select("id, type, reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
      assetData = data
    } else {
      const { data } = await context.supabase.from("creator_shots").select("id, episode_id, aspect_ratio, metadata, referenced_entities").eq("id", input.targetId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
      shotData = data
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", data.episode_id).eq("project_id", projectId).maybeSingle()
      if (!episode) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
    }

    const { data: mentionedEntities, error: mentionedEntityError } = input.mentionedEntityIds.length
      ? await context.supabase
        .from("creator_entities")
        .select("*")
        .eq("project_id", projectId)
        .in("id", input.mentionedEntityIds)
      : { data: [], error: null }
    if (mentionedEntityError) throw mentionedEntityError
    if ((mentionedEntities || []).length !== new Set(input.mentionedEntityIds).size) {
      return NextResponse.json({ error: "One or more mentioned entities do not belong to this project." }, { status: 400 })
    }

    // The project's Basic Settings quality is the default for every image;
    // a caller that names one explicitly still wins.
    const quality = input.quality || projectImageQuality(context.project)
    // Validate the full request before reserving credits.
    const creditCost = calculateCreditCost(input.model, "image", 5, { quality, aspectRatio: input.aspectRatio })
    const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Image Generation (${input.model})`, context.supabase)
    if (!deduct.success) {
      return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
    }
    pendingRefund = { context, amount: creditCost, key: `image-request:${randomUUID()}`, jobId: null }

    const mentionReferencePaths: string[] = []
    for (const entity of mentionedEntities || []) {
      const metadata = entity.metadata && typeof entity.metadata === "object" ? entity.metadata as Record<string, unknown> : {}
      const byteplusAssetId = typeof metadata.byteplus_asset_id === "string" ? metadata.byteplus_asset_id.trim() : ""
      if (provider === "byteplus" && byteplusAssetId) mentionReferencePaths.push(byteplusAssetId)
      else {
        // One image per entity: its chosen reference. Sending every image an
        // entity owns spends the eight-reference budget on a few subjects and
        // silently drops the rest of the cast before the provider sees it.
        const chosen = entityPrimaryReference(entity as MentionableEntity)
        if (chosen) mentionReferencePaths.push(chosen)
      }
    }
    const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])
    const style = projectVisualStyle(context.project)
    // A draw-to-edit request is an edit of one frame, not a new photograph, so
    // it takes neither the camera package nor the look block — both read to an
    // edit model as permission to re-render everything.
    const styleDna = input.drawEdit ? null : resolveStyleDna({ override: input.styleDna, projectDefault: projectStyleDna(context.project) })
    const styleBlock = input.target === "shot" ? "shot" : styleBlockForEntityType(typeof assetData?.type === "string" ? assetData.type : null)
    // The look reference is pixels, and a provider is handed one flat list it
    // treats as things to reproduce — so these are kept out of the cast's budget
    // rather than added to it, and named in the prompt as look-only below.
    const styleReferencePaths = styleReferenceImagesOf(styleDna)
    const castBudget = 8 - Math.min(styleReferencePaths.length, MAX_STYLE_REFERENCE_IMAGES)
    const castReferencePaths = Array.from(new Set([...mentionReferencePaths, ...input.referenceImages]))
      .filter((path) => !styleReferencePaths.includes(path))
      .slice(0, castBudget)
    const combinedReferencePaths = [...castReferencePaths, ...styleReferencePaths]
    const projectDefaultAspect = typeof context.project.default_aspect === "string" ? context.project.default_aspect : null
    const effectiveAspectRatio = input.aspectRatio || (shotData && typeof shotData.aspect_ratio === "string" ? shotData.aspect_ratio : null) || projectDefaultAspect || "9:16"
    // The camera clause is composed here, at submit time, from the base prompt
    // the user actually wrote — which is what is stored on the job and read
    // back into the prompt box. Composing anywhere the result could be written
    // back into the prompt field would stack another clause on every
    // regeneration until the prompt degraded into noise.
    const cameraSettings = resolveCameraSettings({
      block: input.target === "shot" ? "shot" : cameraBlockForEntityType(typeof assetData?.type === "string" ? assetData.type : null),
      override: input.cameraSettings ?? null,
      projectDefaults: projectCameraDefaults(context.project),
    })
    // A draw-to-edit request is not a new photograph. Appending the camera
    // package — "shot on a…, professional photography, ultra-detailed, 8K" —
    // reads to an edit model as an instruction to re-render the whole frame,
    // which is the opposite of applying one marked change to it.
    const framedPrompt = input.drawEdit
      ? stripIdentityDescriptions(input.prompt)
      : applyCameraSettings(stripIdentityDescriptions(input.prompt), cameraSettings, { opticsOnly: Boolean(styleDna) })
    const resolvedPrompt = [
      framedPrompt,
      `Required composition: ${effectiveAspectRatio}.`,
      ...(input.drawEdit ? [`Required project style: ${style}.`, visualStyleDirective(style)] : composeLookDirectives(style, styleDna, styleBlock)),
      styleReferenceClause(styleReferencePaths.length),
      mentionContext,
    ].filter(Boolean).join("\n\n")

    const { data: generationJob, error: generationJobError } = await context.supabase
      .from("creator_generation_jobs")
      .insert({
        user_id: context.user.id,
        project_id: projectId,
        episode_id: (input.target === "shot" && typeof shotData?.episode_id === "string" ? shotData.episode_id : null) || input.episodeId || null,
        shot_id: input.target === "shot" ? input.targetId : null,
        type: "image",
        status: "approved",
        provider,
        model: input.model,
        prompt: input.prompt,
        input_images: combinedReferencePaths,
        settings: {
          target: input.target,
          ...(input.target === "asset" ? { entityId: input.targetId, entityType: assetData?.type || null } : { shotId: input.targetId }),
          style,
          aspectRatio: effectiveAspectRatio,
          quality,
          // Snapshotted, not referenced: editing the project package later
          // must leave every image already generated exactly as it was, and
          // "regenerate this exact frame" needs the package it was shot on.
          cameraSettingsUsed: cameraSettings,
          // Same reason as the camera package above: re-extracting the look from
          // a new mood board must not change what this frame was shot under, and
          // "regenerate this exact frame" needs the look it was shot under.
          styleDnaUsed: styleDna,
          styleReferenceImages: styleReferencePaths,
          basePrompt: input.prompt,
          composedPrompt: resolvedPrompt,
          ...(input.drawEdit ? { drawEdit: input.drawEdit } : {}),
        },
        estimated_credits: creditCost,
        credits_used: 0,
        requires_approval: false,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (generationJobError) throw generationJobError
    pendingGenerationJobId = generationJob.id
    pendingRefund = { ...pendingRefund, key: `generation-job:${generationJob.id}`, jobId: generationJob.id }

    const { error: processingError } = await context.supabase
      .from("creator_generation_jobs")
      .update({ status: "processing", credits_used: creditCost, started_at: new Date().toISOString() })
      .eq("id", generationJob.id)
    if (processingError) throw processingError

    // The provider request can take a while. Persist this state before it starts
    // so leaving/re-entering the tab never makes the request appear to vanish.
    if (input.target === "asset") {
      const { data: asset, error: assetReadError } = await context.supabase
        .from("creator_entities")
        .select("metadata")
        .eq("id", input.targetId)
        .eq("project_id", projectId)
        .single()
      if (assetReadError) throw assetReadError
      const currentMetadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}
      const { error: pendingError } = await context.supabase.from("creator_entities").update({
        metadata: {
          ...currentMetadata,
          image_generation: {
            provider,
            model: input.model,
            prompt: input.prompt,
            resolved_prompt: resolvedPrompt,
            camera_settings_used: cameraSettings,
            style,
            aspect_ratio: effectiveAspectRatio,
            reference_images: combinedReferencePaths,
            mentioned_entity_ids: input.mentionedEntityIds,
            status: "generating",
            requested_at: new Date().toISOString(),
          },
        },
      }).eq("id", input.targetId).eq("project_id", projectId)
      if (pendingError) throw pendingError
      pendingAssetGeneration = { context, projectId, entityId: input.targetId }
    }
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
    let pendingAssetRecord: { assetId: string; name: string } | null = null
    let byteplusAssetUri: string | null = null
    let generationJobId: string | null = pendingGenerationJobId

    if (provider === "openai") {
      image = await generateOpenAIImage({ userId: context.user.id, model: input.model as (typeof openAIImageModels)[number], prompt: resolvedPrompt, referenceUrls, aspectRatio: effectiveAspectRatio, quality: openAIImageQuality(quality === "Ultra" ? "High" : quality) })
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
        pendingAssetRecord = { assetId: assetRes.assetId, name: input.prompt.slice(0, 50) }
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
    // Seedream registers its own output as part of generating it, so that slot
    // is already spent — recording it is what lets an admin see and reclaim it.
    if (pendingAssetRecord) {
      await recordExistingAsset({
        supabase: context.supabase,
        sourcePath: storagePath,
        assetId: pendingAssetRecord.assetId,
        name: pendingAssetRecord.name,
        projectId,
        userId: context.user.id,
      })
    }

    // Every generated image used to be registered with BytePlus here, whether or
    // not Seedance would ever reference it. The library holds 50 for the whole
    // account, so a dozen shots at a few attempts each exhausted it in an
    // afternoon. Registration now happens when an image is actually needed as a
    // reference — see resolveRegisteredAsset — and on demand from the
    // "Add to Asset Library" and "Verify for Seedance" buttons.

    if (input.target === "asset") {
      const { data: asset, error: readError } = await context.supabase.from("creator_entities").select("reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).single()
      if (readError) throw readError
      const currentMeta = (asset.metadata as Record<string, unknown>) || {}
      const metadata = {
        ...currentMeta,
        ...(byteplusAssetId ? { byteplus_asset_id: byteplusAssetId } : {}),
        // Null, not absent: switching the override off has to be remembered as
        // firmly as switching it on, or the panel reopens still overridden.
        // A draw edit is the exception — it carries no camera panel at all, so
        // writing null there would silently un-override the block.
        ...(input.drawEdit && !input.cameraSettings ? {} : { camera_override: input.cameraSettings ? cameraSettings : null }),
        // Null, not absent, for the same reason as the camera override above:
        // switching the look override off has to be remembered as firmly as
        // switching it on, or the panel reopens still overridden.
        ...(input.drawEdit && input.styleDna === undefined ? {} : { style_dna_override: input.styleDna === undefined ? null : styleDna }),
        image_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, camera_settings_used: cameraSettings, style_dna_used: styleDna, style,  aspect_ratio: effectiveAspectRatio, reference_images: combinedReferencePaths, mentioned_entity_ids: input.mentionedEntityIds, status: "completed", completed_at: new Date().toISOString() },
      }
      const updates: Record<string, unknown> = {
        reference_images: [...(asset.reference_images || []), storagePath],
        metadata,
        status: "draft",
      }
      if (byteplusAssetId) updates.byteplus_asset_id = byteplusAssetId
      if (byteplusAssetUri) updates.byteplus_asset_uri = byteplusAssetUri
      if (byteplusAssetId) updates.verification_status = VERIFIED_ASSET.verification_status
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
          ...(input.drawEdit && !input.cameraSettings ? {} : { camera_override: input.cameraSettings ? cameraSettings : null }),
        // Null, not absent, for the same reason as the camera override above:
        // switching the look override off has to be remembered as firmly as
        // switching it on, or the panel reopens still overridden.
        ...(input.drawEdit && input.styleDna === undefined ? {} : { style_dna_override: input.styleDna === undefined ? null : styleDna }),
          image_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, camera_settings_used: cameraSettings, style_dna_used: styleDna, style,  reference_images: combinedReferencePaths, mentioned_entity_ids: input.mentionedEntityIds, status: "completed", completed_at: new Date().toISOString() },
        },
      }).eq("id", input.targetId)
      if (error) throw error

      const { data: historyJob, error: historyError } = await context.supabase
        .from("creator_generation_jobs")
        .update({
          status: "completed",
          result_url: storagePath,
          credits_used: creditCost,
          completed_at: new Date().toISOString(),
        })
        .eq("id", pendingGenerationJobId)
        .select("id")
        .single()
      if (historyError) throw historyError
      generationJobId = historyJob.id
    }
    if (input.target === "asset" && pendingGenerationJobId) {
      const { error: historyError } = await context.supabase
        .from("creator_generation_jobs")
        .update({
          status: "completed",
          result_url: storagePath,
          credits_used: creditCost,
          completed_at: new Date().toISOString(),
        })
        .eq("id", pendingGenerationJobId)
      if (historyError) throw historyError
    }
    pendingRefund = null
    return NextResponse.json({
      path: storagePath,
      imageUrl: storagePath,
      jobId: generationJobId,
      provider,
      model: input.model,
      byteplusAssetId,
      byteplusAssetUri,
      cameraSettingsUsed: cameraSettings,
      creditsCharged: creditCost,
      creditBalance: deduct.newBalance,
    })
  } catch (error) {
    if (pendingRefund) {
      try {
        await refundGenerationCredits(pendingRefund.context.user.id, pendingRefund.amount, pendingRefund.key, "Refund: failed image generation", pendingRefund.jobId, pendingRefund.context.supabase)
      } catch (refundError) {
        console.error("Could not refund failed image generation", refundError)
      }
    }
    if (pendingGenerationJobId && pendingRefund) {
      try {
        await pendingRefund.context.supabase
          .from("creator_generation_jobs")
          .update({
            status: "failed",
            error: studioErrorMessage(error, "Image generation failed"),
            completed_at: new Date().toISOString(),
          })
          .eq("id", pendingGenerationJobId)
      } catch (historyError) {
        console.error("Could not mark image generation failed", historyError)
      }
    }
    if (pendingAssetGeneration) {
      try {
        const { data: asset } = await pendingAssetGeneration.context.supabase
          .from("creator_entities")
          .select("metadata")
          .eq("id", pendingAssetGeneration.entityId)
          .eq("project_id", pendingAssetGeneration.projectId)
          .maybeSingle()
        const metadata = asset?.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}
        await pendingAssetGeneration.context.supabase.from("creator_entities").update({
          metadata: {
            ...metadata,
            image_generation: {
              ...(metadata.image_generation && typeof metadata.image_generation === "object" ? metadata.image_generation : {}),
              status: "failed",
              error: studioErrorMessage(error, "Image generation failed"),
              completed_at: new Date().toISOString(),
            },
          },
        }).eq("id", pendingAssetGeneration.entityId).eq("project_id", pendingAssetGeneration.projectId)
      } catch (stateError) {
        console.error("Could not persist failed asset image generation state", stateError)
      }
    }
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Image generation failed"), jobId: pendingGenerationJobId }, { status: error instanceof OpenAIProviderError || error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) })
  }
}
