import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { BytePlusProviderError, bytePlusVideoRatio, bytePlusVideoReferenceLimit, createBytePlusAsset, getBytePlusAsset, getBytePlusVideoTask, resolveBytePlusReferenceUrl, submitBytePlusVideo } from "@/lib/studio/byteplus"
import { FalProviderError, getFalVideoTask, submitFalVideo } from "@/lib/studio/fal"
import { getGoogleVideoTask, GoogleProviderError, submitGoogleVideo } from "@/lib/studio/google"
import { generationProvider, isVideoGenerationModel } from "@/lib/studio/generation-models"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { trackGenerationActivation } from "@/lib/studio/activation"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { buildEntityMentionContext, entityPrimaryReference, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { projectVisualStyle } from "@/lib/studio/entity-image-workflow"
import { composeLookDirectives, projectStyleDna } from "@/lib/studio/style-dna"
import { stripIdentityDescriptions } from "@/lib/studio/prompt-sanitizer"
import { recordExistingAsset, resolveRegisteredAsset } from "@/lib/studio/byteplus-assets"
import { parseSeedanceMissingAssetError, parseSeedanceRejectedReference, purgeStaleBytePlusAsset, seedanceReferenceAssetUri } from "@/lib/studio/seedance-reference-error"

const submitSchema = z.object({
  shotId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(20_000),
  model: z.string().refine(isVideoGenerationModel, "Unsupported video model"),
  referenceImages: z.array(z.string().max(2_000)).max(50).default([]),
  characterEntityIds: z.array(z.string().uuid()).max(10).default([]),
  mentionedEntityIds: z.array(z.string().uuid()).max(20).default([]),
  generationMode: z.enum(["keyframe", "multi_image"]).default("keyframe"),
  startFrame: z.string().max(2_000).nullable().optional(),
  endFrame: z.string().max(2_000).nullable().optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"]).default("9:16"),
  resolution: z.enum(["480p", "720p", "1080p", "4K"]).default("720p"),
  quality: z.enum(["Low", "Medium", "High", "Ultra"]).default("Medium"),
  audioEnabled: z.boolean().default(true),
  durationSeconds: z.number().int().min(4).max(30).default(4),
  // Storage paths or URLs of clips the shot should inherit motion and look from.
  referenceVideos: z.array(z.string().max(2_000)).max(10).default([]),
  // Chains this shot to the one before it by passing that shot's finished video
  // as a reference, which is how continuity carries across a sequence.
  continueFromPreviousShot: z.boolean().default(false),
}).strict()

async function verifyShot(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, projectId: string, shotId: string) {
  const { data: shot } = await context.supabase.from("creator_shots").select("id, episode_id, order_index, duration_seconds, aspect_ratio, resolution, keyframe_image, metadata, referenced_entities").eq("id", shotId).maybeSingle()
  if (!shot) return null
  const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", shot.episode_id).eq("project_id", projectId).maybeSingle()
  return episode ? shot : null
}

async function signedReferenceUrls(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, paths: string[]) {
  const urls: string[] = []
  for (const path of paths) {
    if (/^https?:\/\//i.test(path) || /^asset:\/\//i.test(path) || /^asset-[a-z0-9-]+$/i.test(path)) {
      urls.push(path)
      continue
    }
    const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    if (error) throw error
    urls.push(data.signedUrl)
  }
  return urls
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  let pendingRefund: { userId: string; amount: number; key: string; client: SupabaseClient } | null = null
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = submitSchema.parse(await request.json())
    const shot = await verifyShot(context, projectId, input.shotId)
    if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
    const provider = generationProvider(input.model)

    const resolvedEntityIds = Array.from(new Set([...input.characterEntityIds, ...input.mentionedEntityIds]))
    const { data: resolvedEntities, error: resolvedEntityError } = resolvedEntityIds.length
      ? await context.supabase
        .from("creator_entities")
        .select("*")
        .eq("project_id", projectId)
        .in("id", resolvedEntityIds)
      : { data: [], error: null }
    if (resolvedEntityError) throw resolvedEntityError
    if ((resolvedEntities || []).length !== resolvedEntityIds.length) {
      return NextResponse.json({ error: "One or more referenced entities do not belong to this project." }, { status: 400 })
    }

    // Validate the full request before reserving credits.
    const creditCost = calculateCreditCost(input.model, "video", input.durationSeconds, { resolution: input.resolution, aspectRatio: input.aspectRatio, quality: input.quality })
    const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Video Generation (${input.model})`, context.supabase)
    if (!deduct.success) {
      return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
    }
    pendingRefund = { userId: context.user.id, amount: creditCost, key: `video-request:${randomUUID()}`, client: context.supabase }

    // Resolve canonical character, scene, and prop references plus direct shot references.
    let combinedReferencePaths: string[] = []
    // A BytePlus asset id is what the provider needs, but it is not a storage
    // path and cannot be signed, so recording it as the reference left the
    // workspace showing empty tiles. The viewable image is kept alongside it.
    const displayReferencePaths: string[] = []
    const facePaths = new Set<string>()
    const rawImagesToOmit = new Set<string>()

    // Check if shot keyframe image has a registered BytePlus asset ID in metadata
    const shotMeta = (shot.metadata as Record<string, unknown>) || {}
    const shotBytePlusAssetId = typeof shotMeta.byteplus_asset_id === "string" && shotMeta.byteplus_asset_id.trim() ? shotMeta.byteplus_asset_id.trim() : null
    const shotReferenceAssets = shotMeta.byteplus_reference_assets && typeof shotMeta.byteplus_reference_assets === "object" && !Array.isArray(shotMeta.byteplus_reference_assets)
      ? shotMeta.byteplus_reference_assets as Record<string, unknown>
      : {}

    if (provider === "byteplus" && shotBytePlusAssetId) {
      const info = await getBytePlusAsset(shotBytePlusAssetId).catch(() => null)
      if (info && (info.status === "Active" || info.status === "active")) {
        combinedReferencePaths.push(shotBytePlusAssetId)
        if (shot.keyframe_image) { rawImagesToOmit.add(shot.keyframe_image); displayReferencePaths.push(shot.keyframe_image) }
      } else {
        const cleanMeta = { ...shotMeta }
        delete cleanMeta.byteplus_asset_id
        delete cleanMeta.byteplus_asset_uri
        await context.supabase.from("creator_shots").update({ metadata: cleanMeta }).eq("id", shot.id)
        if (shot.keyframe_image) combinedReferencePaths.push(shot.keyframe_image)
      }
    } else if (shot.keyframe_image && !input.startFrame) {
      combinedReferencePaths.push(shot.keyframe_image)
    }

    if (resolvedEntities && resolvedEntities.length > 0) {
      for (const entity of resolvedEntities) {
        const rawEntityAssetId = typeof entity.metadata === "object" && entity.metadata !== null ? (entity.metadata as Record<string, unknown>).byteplus_asset_id : null
        const byteplusAssetId = typeof rawEntityAssetId === "string" && rawEntityAssetId.trim() ? rawEntityAssetId.trim() : typeof entity.byteplus_asset_id === "string" && entity.byteplus_asset_id.trim() ? entity.byteplus_asset_id.trim() : null

        let isValidAsset = false
        if (provider === "byteplus" && byteplusAssetId) {
          const info = await getBytePlusAsset(byteplusAssetId).catch(() => null)
          if (info && (info.status === "Active" || info.status === "active")) {
            isValidAsset = true
            combinedReferencePaths.push(byteplusAssetId)
            const viewable = entityPrimaryReference(entity as MentionableEntity)
            if (viewable) displayReferencePaths.push(viewable)
            if (viewable) {
              await recordExistingAsset({
                supabase: context.supabase,
                sourcePath: viewable,
                assetId: byteplusAssetId,
                name: entity.name,
                projectId,
                entityId: entity.id,
                userId: context.user.id,
              })
            }
            if (Array.isArray(entity.reference_images)) {
              for (const img of entity.reference_images) {
                if (typeof img === "string" && img.trim()) {
                  rawImagesToOmit.add(img.trim())
                }
              }
            }
          } else {
            const entityMeta = typeof entity.metadata === "object" && entity.metadata !== null ? { ...(entity.metadata as Record<string, unknown>) } : {}
            delete entityMeta.byteplus_asset_id
            delete entityMeta.byteplus_asset_uri
            await context.supabase.from("creator_entities").update({
              byteplus_asset_id: null,
              byteplus_asset_uri: null,
              metadata: entityMeta,
            }).eq("id", entity.id)
          }
        }

        if (!isValidAsset) {
          const chosen = entityPrimaryReference(entity as MentionableEntity)
          if (chosen) {
            combinedReferencePaths.push(chosen.trim())
            if (entity.type === "character") facePaths.add(chosen.trim())
          }
        }
      }
    }

    // Include direct shot reference images
    // A clip picked from the reference library is a motion reference, not an
    // image one. Sending it as image_url makes the provider reject the whole
    // request for an unsupported image format.
    const looksLikeVideo = (path: string) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(path)
    const pickedVideoPaths: string[] = []
    for (const refPath of input.referenceImages) {
      if (rawImagesToOmit.has(refPath)) continue
      if (looksLikeVideo(refPath)) {
        pickedVideoPaths.push(refPath)
        continue
      }
      const registeredAssetUri = provider === "byteplus" ? seedanceReferenceAssetUri(shotReferenceAssets[refPath]) : null
      combinedReferencePaths.push(registeredAssetUri || refPath)
      displayReferencePaths.push(refPath)
    }

    // Deduplicate reference paths
    combinedReferencePaths = Array.from(new Set(combinedReferencePaths))
    // What the workspace shows: every reference as an image it can actually
    // render, with provider asset ids swapped for their source picture.
    const viewableReferencePaths = Array.from(new Set([
      ...displayReferencePaths,
      ...combinedReferencePaths.filter((path) => !/^asset:\/\//i.test(path) && !/^asset-[a-z0-9-]+$/i.test(path)),
    ]))

    const references = await signedReferenceUrls(context, combinedReferencePaths)
    const faceReferences = await signedReferenceUrls(context, combinedReferencePaths.filter((path) => facePaths.has(path)))
    // A face has to be registered to clear the provider's real-person check.
    // Doing that inside the submit created a new asset on every render, which is
    // what filled the account's 50-image library within hours; the registry
    // makes it once and remembers it.
    const facePathList = combinedReferencePaths.filter((path) => facePaths.has(path))
    for (let index = 0; index < facePathList.length; index += 1) {
      const path = facePathList[index]
      const signed = faceReferences[index]
      if (!signed) continue
      const assetUri = await resolveRegisteredAsset({
        supabase: context.supabase,
        sourcePath: path,
        imageUrl: signed,
        name: path.split("/").pop() || undefined,
        projectId,
        userId: context.user.id,
      })
      if (!assetUri) continue
      const slot = references.indexOf(signed)
      if (slot >= 0) references[slot] = assetUri
      faceReferences[index] = assetUri
    }

    // Seedance accepts finished clips as references, so a shot can inherit the
    // motion and look of the one before it instead of restarting cold.
    // Clips that arrived in the image list belong here instead.
    const videoReferencePaths = [...input.referenceVideos, ...pickedVideoPaths]
    if (input.continueFromPreviousShot) {
      const { data: previousShot } = await context.supabase
        .from("creator_shots")
        .select("video_url,order_index")
        .eq("episode_id", shot.episode_id)
        .lt("order_index", shot.order_index)
        .not("video_url", "is", null)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (previousShot?.video_url) videoReferencePaths.unshift(previousShot.video_url)
    }
    const videoLimit = bytePlusVideoReferenceLimit(input.model)
    const videoReferences = await signedReferenceUrls(
      context,
      Array.from(new Set(videoReferencePaths)).slice(0, videoLimit.maxVideos),
    )
    const mentionContext = buildEntityMentionContext((resolvedEntities || []) as MentionableEntity[])
    const style = projectVisualStyle(context.project)
    const resolvedPrompt = [stripIdentityDescriptions(input.prompt), ...composeLookDirectives(style, projectStyleDna(context.project), "shot"), mentionContext].filter(Boolean).join("\n\n")
    const displayRatio = input.aspectRatio || shot.aspect_ratio || "9:16"
    const providerRatio = provider === "byteplus" ? bytePlusVideoRatio(displayRatio, videoReferences.length > 0) : displayRatio
    const providerRequest = { prompt: resolvedPrompt, originalPrompt: input.prompt, style, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: providerRatio, displayRatio, referenceImages: combinedReferencePaths, characterEntityIds: input.characterEntityIds, mentionedEntityIds: input.mentionedEntityIds, resolvedEntityIds, generationMode: input.generationMode, startFrame: input.startFrame || null, endFrame: input.endFrame || null, audioEnabled: input.audioEnabled }

    const { data: job, error: jobError } = await context.supabase.from("creator_generation_jobs").insert({
      user_id: context.user.id,
      project_id: projectId,
      // Which episode this render belongs to. Left unset, every video job in
      // the studio was unattributed, so an episode's cost panel reported zero
      // video spend while its clips were the whole bill.
      episode_id: shot.episode_id,
      shot_id: shot.id,
      type: "video",
      status: "approved",
      provider,
      model: input.model,
      prompt: input.prompt,
      input_images: combinedReferencePaths,
      settings: providerRequest,
      provider_request: providerRequest,
      requires_approval: true,
      approved_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      idempotency_key: randomUUID(),
      operation: "submit_video_generation",
      estimated_credits: creditCost,
      credits_used: 0,
    }).select("*").single()
    if (jobError) throw jobError
    pendingRefund.key = `generation-job:${job.id}`

    try {
      let task: { id: string; response?: unknown }
      if (provider === "fal") {
        const falRes = await submitFalVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references, endReferenceUrl: input.endFrame || undefined })
        task = { id: falRes.id, response: falRes }
      } else if (provider === "google") {
        const gRes = await submitGoogleVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references })
        task = { id: gRes.id, response: gRes.response }
      } else {
        const bpRes = await submitBytePlusVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: providerRatio, referenceUrls: references, faceReferenceUrls: faceReferences, videoReferenceUrls: videoReferences, generationMode: input.generationMode, audioEnabled: input.audioEnabled })
        task = { id: bpRes.id, response: bpRes.response }
      }
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "processing", credits_used: creditCost, provider_job_id: task.id, provider_response: task.response }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...resolvedEntityIds])), metadata: { ...(shot.metadata || {}), video_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, style, reference_images: viewableReferencePaths, character_entity_ids: input.characterEntityIds, mentioned_entity_ids: input.mentionedEntityIds, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
      ])
      return NextResponse.json({
        jobId: job.id,
        providerJobId: task.id,
        status: "processing",
        provider,
        model: input.model,
        creditsCharged: creditCost,
        creditBalance: deduct.newBalance,
      }, { status: 202 })
    } catch (error) {
      const errorMessage = studioErrorMessage(error, "Submission failed")
      const missingAsset = parseSeedanceMissingAssetError(errorMessage)
      if (missingAsset?.assetId && provider === "byteplus") {
        await purgeStaleBytePlusAsset(context.supabase, missingAsset.assetId, projectId)
        try {
          const freshSignedUrls = await signedReferenceUrls(context, viewableReferencePaths)
          const freshReferences = await Promise.all(freshSignedUrls.map((url: string, idx: number) => resolveBytePlusReferenceUrl(url, facePaths.has(viewableReferencePaths[idx]))))
          const freshFaceReferences = freshReferences.filter((_: string, idx: number) => facePaths.has(viewableReferencePaths[idx]))

          const bpRes = await submitBytePlusVideo({
            model: input.model,
            prompt: resolvedPrompt,
            duration: input.durationSeconds || Number(shot.duration_seconds || 5),
            resolution: input.resolution || shot.resolution || "720p",
            ratio: providerRatio,
            referenceUrls: freshReferences,
            faceReferenceUrls: freshFaceReferences,
            videoReferenceUrls: videoReferences,
            generationMode: input.generationMode,
            audioEnabled: input.audioEnabled,
          })
          const task = { id: bpRes.id, response: bpRes.response }
          await Promise.all([
            context.supabase.from("creator_generation_jobs").update({ status: "processing", credits_used: creditCost, provider_job_id: task.id, provider_response: task.response }).eq("id", job.id),
            context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...resolvedEntityIds])), metadata: { ...(shot.metadata || {}), video_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, style, reference_images: viewableReferencePaths, character_entity_ids: input.characterEntityIds, mentioned_entity_ids: input.mentionedEntityIds, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
          ])
          return NextResponse.json({
            jobId: job.id,
            providerJobId: task.id,
            status: "processing",
            provider,
            model: input.model,
            creditsCharged: creditCost,
            creditBalance: deduct.newBalance,
          }, { status: 202 })
        } catch (retryError) {
          console.warn("Auto-retry after clearing stale BytePlus asset failed:", retryError)
        }
      }

      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", shot.id),
      ])
      const refund = await refundGenerationCredits(context.user.id, creditCost, `generation-job:${job.id}`, "Refund: failed video generation", job.id, context.supabase)
      pendingRefund = null
      const rejected = parseSeedanceRejectedReference(errorMessage)
      return NextResponse.json({
        error: missingAsset
          ? `Stale reference asset (${missingAsset.assetId}) was missing from BytePlus. Stale asset cache has been cleaned up. Please try generating again.`
          : errorMessage,
        inputImages: combinedReferencePaths,
        rejectedReference: rejected ? {
          ...rejected,
          path: combinedReferencePaths[rejected.referenceIndex] || null,
        } : null,
        creditsRefunded: refund.refunded ? creditCost : 0,
        creditBalance: refund.newBalance,
      }, { status: error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError ? error.status : studioErrorStatus(error) })
    }
  } catch (error) {
    if (pendingRefund) {
      try {
        await refundGenerationCredits(pendingRefund.userId, pendingRefund.amount, pendingRefund.key, "Refund: video generation could not start", null, pendingRefund.client)
      } catch (refundError) {
        console.error("Could not refund failed video generation", refundError)
      }
    }
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid video request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Video generation failed") }, { status: error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError ? error.status : studioErrorStatus(error) })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const jobId = request.nextUrl.searchParams.get("jobId")
    if (!jobId || !z.string().uuid().safeParse(jobId).success) return NextResponse.json({ error: "Valid jobId is required" }, { status: 400 })
    const { data: job } = await context.supabase.from("creator_generation_jobs").select("*").eq("id", jobId).eq("project_id", projectId).eq("user_id", context.user.id).maybeSingle()
    if (!job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 })
    if (["completed", "failed", "cancelled"].includes(job.status)) return NextResponse.json(job)
    if (!job.provider_job_id || !isVideoGenerationModel(job.model)) return NextResponse.json({ error: "Generation job is missing provider details" }, { status: 409 })

    const provider = generationProvider(job.model)
    let task: { status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; content?: { video_url?: string }; error?: { message?: string } }

    if (provider === "fal") {
      // fal endpoints are namespaced. The old fallback dropped the "fal-ai/"
      // prefix, so a job without a stored endpoint polled a path that does not
      // exist and reported "Not Found" as if the video had vanished.
      const storedEndpoint = (job.provider_response as Record<string, unknown>)?.endpoint
      const endpoint = typeof storedEndpoint === "string" && storedEndpoint.trim()
        ? (storedEndpoint.startsWith("fal-ai/") ? storedEndpoint : `fal-ai/${storedEndpoint}`)
        : "fal-ai/bytedance/seedance-2.0/image-to-video"
      task = await getFalVideoTask(job.provider_job_id, endpoint)
    } else if (provider === "google") {
      task = await getGoogleVideoTask(job.provider_job_id)
    } else {
      task = await getBytePlusVideoTask(job.provider_job_id)
    }

    if (task.status === "failed" || task.status === "cancelled") {
      const error = task.error?.message || `${provider} task ${task.status}`
      const charged = Number(job.credits_used || job.estimated_credits || 0)
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, `Refund: ${task.status} video generation`, job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: task.status === "cancelled" ? "cancelled" : "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", error: { message: error }, completed_at: new Date().toISOString() }).eq("id", job.workflow_run_id)
      return NextResponse.json({ ...job, status: task.status === "cancelled" ? "cancelled" : "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }
    if (task.status !== "succeeded" || !task.content?.video_url) return NextResponse.json({ ...job, status: "processing", providerStatus: task.status })

    const output = await fetch(task.content.video_url)
    if (!output.ok) throw new BytePlusProviderError(`Could not download generated video (${output.status}).`)
    const storagePath = `${context.user.id}/${projectId}/${provider}-video-${randomUUID()}.mp4`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, Buffer.from(await output.arrayBuffer()), { contentType: "video/mp4", upsert: false })
    if (uploadError) throw uploadError
    const completedAt = new Date().toISOString()
    if (!job.shot_id) throw new Error("Generation completed without a target shot")
    const { error: attachError } = await context.supabase.from("creator_shots").update({ video_url: storagePath, video_status: "completed" }).eq("id", job.shot_id)
    if (attachError) throw attachError
    const { data: verifiedShot, error: verifyError } = await context.supabase.from("creator_shots").select("id,episode_id,video_url,referenced_entities").eq("id", job.shot_id).maybeSingle()
    if (verifyError) throw verifyError
    const target = job.target_snapshot && typeof job.target_snapshot === "object" ? job.target_snapshot as Record<string, unknown> : {}
    const expectedReferences = Array.isArray(target.entityReferenceIds) ? target.entityReferenceIds.filter((id): id is string => typeof id === "string") : []
    const checks = {
      shot: verifiedShot?.id === target.shotId || !target.shotId,
      episode: verifiedShot?.episode_id === target.episodeId || !target.episodeId,
      prompt: createHash("sha256").update(job.prompt || "").digest("hex") === target.promptHash || !target.promptHash,
      references: expectedReferences.every((id) => (verifiedShot?.referenced_entities || []).includes(id)),
      attachment: verifiedShot?.video_url === storagePath,
    }
    if (Object.values(checks).some((value) => !value)) throw new Error(`Generation verification failed: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`)
    const verification = { status: "verified", checkedAt: new Date().toISOString(), checks, resultPath: storagePath }
    await context.supabase.from("creator_generation_jobs").update({ status: "completed", provider_response: task, result_url: storagePath, verification, completed_at: completedAt }).eq("id", job.id)
    if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "completed", summary: { generationJobs: 1, completed: 1, failed: 0, verified: 1 }, completed_at: completedAt }).eq("id", job.workflow_run_id)
    // The clip is downloaded, stored, attached and verified. A later poll of the
    // same job returns early above, so this runs once per finished video.
    await trackGenerationActivation({
      supabase: context.supabase,
      userId: context.user.id,
      email: context.user.email,
      sourceUrl: `https://www.aidirectorhub.com/studio/project/${projectId}`,
    })
    return NextResponse.json({ ...job, status: "completed", result_url: storagePath, verification, completed_at: completedAt })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check video status") }, { status: error instanceof BytePlusProviderError || error instanceof FalProviderError ? error.status : studioErrorStatus(error) })
  }
}
