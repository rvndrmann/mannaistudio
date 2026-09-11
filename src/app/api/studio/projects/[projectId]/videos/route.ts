import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { executeGenerationJobs } from "@/lib/studio/execute-generation"
import { z, ZodError } from "zod"
import { BytePlusProviderError, bytePlusVideoRatio, bytePlusVideoReferenceLimit, createBytePlusAsset, getBytePlusAsset, getBytePlusVideoTask, resolveBytePlusReferenceUrl, submitBytePlusVideo } from "@/lib/studio/byteplus"
import { falVideoEndpoint, FalProviderError, getFalVideoTask, submitFalVideo } from "@/lib/studio/fal"
import { getGoogleVideoTask, GoogleProviderError, submitGoogleVideo } from "@/lib/studio/google"
import { generationProvider, isVideoGenerationModel } from "@/lib/studio/generation-models"
import { byokProviderFor } from "@/lib/byok/providers"
import { decideBilling, refundableCredits } from "@/lib/byok/billing"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { trackGenerationActivation } from "@/lib/studio/activation"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { isStalledVideoJob } from "@/lib/studio/stalled-jobs"
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

    // Every picture in this project that already has a registered asset, keyed
    // by the path it was registered from.
    //
    // A reference added through the Multi Image strip was resolved only against
    // the shot's own asset map, and a character's registration lives on the
    // entity — so a face that was verified minutes ago still went to the
    // provider as a raw URL and was rejected as a real person. It also meant
    // registering it again, spending one of the fifty slots on a duplicate of
    // something already registered.
    const { data: everyEntity } = await context.supabase
      .from("creator_entities")
      .select("reference_images,metadata")
      .eq("project_id", projectId)
    const entityAssetByPath = new Map<string, string>()
    for (const entity of everyEntity || []) {
      const meta = (entity.metadata || {}) as Record<string, unknown>
      const assetId = typeof meta.byteplus_asset_id === "string" ? meta.byteplus_asset_id.trim() : ""
      if (!assetId) continue
      for (const path of (entity.reference_images || []) as string[]) {
        if (typeof path === "string" && path) entityAssetByPath.set(path, assetId)
      }
    }

    // Validate the full request before reserving credits.
    const platformCost = calculateCreditCost(input.model, "video", input.durationSeconds, { resolution: input.resolution, aspectRatio: input.aspectRatio, quality: input.quality })
    // Same rule as every other charge path. This route billed directly and
    // never asked, so a connected key was ignored and "only my own keys" was
    // not honoured — the video equivalent of the image bug.
    const byokProvider = byokProviderFor(provider)
    const billing = decideBilling({
      hasCredential: byokProvider ? await hasCredential(context.user.id, byokProvider) : false,
      platformCredits: platformCost,
      ownKeysOnly: await ownKeysOnly(context.user.id).catch(() => false),
      provider: byokProvider || provider,
    })
    const creditCost = billing.credits
    let creditBalanceAfter: number | null = null
    if (billing.mode !== "byok") {
      const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Video Generation (${input.model})`, context.supabase)
      if (!deduct.success) {
        return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
      }
      creditBalanceAfter = deduct.newBalance
      // Only a charge can be refunded; a BYOK failure is the provider's bill.
      pendingRefund = { userId: context.user.id, amount: creditCost, key: `video-request:${randomUUID()}`, client: context.supabase }
    }

    /** Submits on whichever account is paying for this clip. */
    const runOnBillingAccount = async <T,>(work: () => Promise<T>): Promise<T> => {
      if (billing.mode !== "byok" || !byokProvider) return work()
      const ran = await withCredential({ userId: context.user.id, provider: byokProvider }, (parts) =>
        runWithCredential(byokProvider, parts, work))
      if (ran === null) throw new Error("The provider key for this model is no longer connected.")
      return ran
    }

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

    // In Multi Image mode the keyframe is one of the tiles the user can see and
    // delete, so it reaches here through input.referenceImages or not at all.
    // Attaching it on the shot's behalf made a removed keyframe come back —
    // silently, and at the front of the reference list where it weighed most.
    const multiImage = input.generationMode === "multi_image"
    let shotKeyframeAssetId: string | null = null

    if (provider === "byteplus" && shotBytePlusAssetId) {
      const info = await getBytePlusAsset(shotBytePlusAssetId).catch(() => null)
      if (info && (info.status === "Active" || info.status === "active")) {
        shotKeyframeAssetId = shotBytePlusAssetId
        if (!multiImage) {
          combinedReferencePaths.push(shotBytePlusAssetId)
          if (shot.keyframe_image) { rawImagesToOmit.add(shot.keyframe_image); displayReferencePaths.push(shot.keyframe_image) }
        }
      } else {
        const cleanMeta = { ...shotMeta }
        delete cleanMeta.byteplus_asset_id
        delete cleanMeta.byteplus_asset_uri
        await context.supabase.from("creator_shots").update({ metadata: cleanMeta }).eq("id", shot.id)
        if (shot.keyframe_image && !multiImage) combinedReferencePaths.push(shot.keyframe_image)
      }
    } else if (shot.keyframe_image && !input.startFrame && !multiImage) {
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
      // A kept keyframe still goes to the provider as its registered asset —
      // the asset id is what clears the real-person check, and re-sending the
      // raw picture instead would have it rejected.
      const registeredAssetUri = provider === "byteplus"
        ? (refPath === shot.keyframe_image && shotKeyframeAssetId
            ? shotKeyframeAssetId
            : seedanceReferenceAssetUri(shotReferenceAssets[refPath]) || entityAssetByPath.get(refPath) || null)
        : null
      combinedReferencePaths.push(registeredAssetUri || refPath)
      // A picture attached to the shot itself is as likely to show a person as
      // one belonging to a cast member — it is usually a character's photo or a
      // rendered frame of one. Only cast references were treated as faces here,
      // so a character added through the multi-image strip rather than the cast
      // was never registered, went to the provider as a plain URL, and was
      // rejected as a real person no matter how many times it was verified:
      // verification registered the picture, and this never asked for it.
      //
      // Already-registered references are skipped: they carry an asset uri and
      // have nothing left to resolve.
      if (!registeredAssetUri) facePaths.add(refPath)
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
      // `references` and `faceReferences` are signed in separate calls, so
      // their URLs carry different tokens even when they represent the same
      // storage path. Matching on `signed` therefore never found the outgoing
      // reference and left the raw face image in the BytePlus request after a
      // successful Asset Library verification. The canonical source path is
      // stable and is unique here because `combinedReferencePaths` is deduped.
      const slot = combinedReferencePaths.indexOf(path)
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
    const distinctVideoPaths = Array.from(new Set(videoReferencePaths)).slice(0, videoLimit.maxVideos)
    const distinctVideoInputs = distinctVideoPaths.map((videoPath) => {
      const registeredAssetUri = provider === "byteplus" ? seedanceReferenceAssetUri(shotReferenceAssets[videoPath]) : null
      return registeredAssetUri || videoPath
    })
    const videoReferences = await signedReferenceUrls(
      context,
      distinctVideoInputs,
    )
    if (provider === "byteplus") {
      for (let idx = 0; idx < distinctVideoInputs.length; idx += 1) {
        const rawPath = distinctVideoPaths[idx]
        const inputRef = distinctVideoInputs[idx]
        if (/^asset:\/\//i.test(inputRef)) continue
        const signed = videoReferences[idx]
        if (!signed) continue
        const assetUri = await resolveRegisteredAsset({
          supabase: context.supabase,
          sourcePath: rawPath,
          imageUrl: signed,
          name: rawPath.split("/").pop() || "motion_clip",
          projectId,
          userId: context.user.id,
          assetType: "Video",
        })
        if (assetUri) videoReferences[idx] = assetUri
      }
    }
    const mentionContext = buildEntityMentionContext((resolvedEntities || []) as MentionableEntity[])
    const style = projectVisualStyle(context.project)
    const resolvedPrompt = [stripIdentityDescriptions(input.prompt), ...composeLookDirectives(style, projectStyleDna(context.project), "shot"), mentionContext].filter(Boolean).join("\n\n")
    const displayRatio = input.aspectRatio || shot.aspect_ratio || "9:16"
    const providerRatio = provider === "byteplus" ? bytePlusVideoRatio(displayRatio, videoReferences.length > 0) : displayRatio
    const providerRequest = { prompt: resolvedPrompt, originalPrompt: input.prompt, style, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: providerRatio, displayRatio, referenceImages: combinedReferencePaths, characterEntityIds: input.characterEntityIds, mentionedEntityIds: input.mentionedEntityIds, resolvedEntityIds, generationMode: input.generationMode, startFrame: input.startFrame || null, endFrame: input.endFrame || null, audioEnabled: input.audioEnabled, videoReferencePaths, referenceVideos: input.referenceVideos }

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
    // Only set when a charge happened; a BYOK clip has nothing to refund.
    if (pendingRefund) pendingRefund.key = `generation-job:${job.id}`

    try {
      const task: { id: string; response?: unknown } = await runOnBillingAccount(async () => {
      let task: { id: string; response?: unknown }
      if (provider === "fal") {
        // Resolution and the audio flag travel with the request now. They were
        // collected, stored on the shot and priced into the credit cost, and
        // then not sent: fal rendered at its own default and always with audio.
        const falRes = await submitFalVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references, endReferenceUrl: input.endFrame || undefined, audioEnabled: input.audioEnabled })
        task = { id: falRes.id, response: falRes }
      } else if (provider === "google") {
        const gRes = await submitGoogleVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references })
        task = { id: gRes.id, response: gRes.response }
      } else {
        const bpRes = await submitBytePlusVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: providerRatio, referenceUrls: references, faceReferenceUrls: faceReferences, videoReferenceUrls: videoReferences, generationMode: input.generationMode, audioEnabled: input.audioEnabled })
        task = { id: bpRes.id, response: bpRes.response }
      }
      return task
      })
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "processing", credits_used: creditCost, billing_mode: billing.mode, provider_job_id: task.id, provider_response: task.response }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...resolvedEntityIds])), metadata: { ...(shot.metadata || {}), video_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, style, reference_images: viewableReferencePaths, reference_videos: videoReferencePaths, video_reference_paths: videoReferencePaths, character_entity_ids: input.characterEntityIds, mentioned_entity_ids: input.mentionedEntityIds, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
      ])
      return NextResponse.json({
        jobId: job.id,
        providerJobId: task.id,
        status: "processing",
        provider,
        model: input.model,
        creditsCharged: creditCost,
        creditBalance: creditBalanceAfter,
        videoReferencePaths,
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
            context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...resolvedEntityIds])), metadata: { ...(shot.metadata || {}), video_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, style, reference_images: viewableReferencePaths, reference_videos: videoReferencePaths, video_reference_paths: videoReferencePaths, character_entity_ids: input.characterEntityIds, mentioned_entity_ids: input.mentionedEntityIds, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
          ])
          return NextResponse.json({
            jobId: job.id,
            providerJobId: task.id,
            status: "processing",
            provider,
            model: input.model,
            creditsCharged: creditCost,
            creditBalance: creditBalanceAfter,
            videoReferencePaths,
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
        videoReferencePaths,
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
    // A job that never reached the provider. This answered 409 on every poll
    // while the workspace went on showing the shot as generating — a spinner
    // and an error taking turns, for ever, with the credits still reserved.
    // There is no provider to ask about it, so it is settled here on its own
    // age, the same way the queue-stall below is settled.
    if (!job.provider_job_id) {
      // An approved job nobody is carrying. The request that approved it fired
      // the work as a floating promise and returned, and the host froze the
      // function before it reached the provider — so this is not a render in
      // flight, it is one that never started. Finishing it here is better than
      // waiting six minutes to refund something no one attempted.
      //
      // Claimed with a conditional update so two polls cannot both submit it:
      // only the request that moves the row out of `approved` proceeds.
      //
      // A claim can itself be abandoned — the host kills the request between
      // marking the row and reaching the provider — which left the job in
      // `processing` with no id, where the first version of this looked only at
      // `approved` and never came back for it. So a claim that has gone quiet
      // for longer than any real submission takes is claimable again, and the
      // re-claim is conditioned on the exact started_at that was read, which is
      // what stops two pollers from both taking it.
      const claimAgeMs = job.started_at ? Date.now() - Date.parse(job.started_at as string) : Infinity
      const abandonedClaim = job.status === "processing" && Number.isFinite(claimAgeMs) && claimAgeMs > 90_000
      if (job.status === "approved" || abandonedClaim) {
        const claim = context.supabase
          .from("creator_generation_jobs")
          .update({ status: "processing", started_at: new Date().toISOString() })
          .eq("id", job.id)
        const { data: claimed } = await (abandonedClaim
          ? claim.eq("started_at", job.started_at as string)
          : claim.eq("status", "approved")
        ).select("id").maybeSingle()
        if (claimed) {
          await executeGenerationJobs(context, [job.id as string])
          const { data: ran } = await context.supabase
            .from("creator_generation_jobs")
            .select("*")
            .eq("id", job.id)
            .maybeSingle()
          if (ran) return NextResponse.json(ran)
        }
        return NextResponse.json({ ...job, status: "processing", providerStatus: "submitting" })
      }
      if (!isStalledVideoJob(job, null)) {
        return NextResponse.json({ ...job, status: job.status, providerStatus: "submitting" })
      }
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: video generation was never submitted", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      const error = "This video was approved but never reached the provider — the server handling it went away. Nothing was rendered and the credits have been returned. Try generating it again."
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }
    if (!isVideoGenerationModel(job.model)) return NextResponse.json({ error: "Generation job is missing provider details" }, { status: 409 })

    const provider = generationProvider(job.model)
    let task: { status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; content?: { video_url?: string }; error?: { message?: string }; created_at?: number; updated_at?: number }

    if (provider === "fal") {
      // The endpoint a request was submitted to is what polls it, so it is used
      // exactly as it was stored. It used to have "fal-ai/" forced back on when
      // it did not start with it, which was written when every fal model was
      // owned by fal-ai — Seedance 2.x is owned by `bytedance`, and the prefix
      // turns a working endpoint into the 404 that broke every one of those
      // renders. A job old enough to have stored no endpoint is rebuilt from
      // its model and the references it was given.
      const storedEndpoint = (job.provider_response as Record<string, unknown>)?.endpoint
      const endpoint = typeof storedEndpoint === "string" && storedEndpoint.trim()
        ? storedEndpoint.trim()
        : falVideoEndpoint(job.model, Array.isArray(job.input_images) ? job.input_images.length : 0)
      task = await getFalVideoTask(job.provider_job_id, endpoint)
    } else if (provider === "google") {
      task = await getGoogleVideoTask(job.provider_job_id)
    } else {
      task = await getBytePlusVideoTask(job.provider_job_id)
    }

    if (task.status === "failed" || task.status === "cancelled") {
      const error = task.error?.message || `${provider} task ${task.status}`
      // Reads the recorded billing mode, not whichever number is non-zero. A
      // BYOK clip charged nothing, so this fallback would refund its estimate —
      // and a provider that keeps failing would print credits.
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
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
    // A task the provider queue accepted but never started. BytePlus leaves
    // updated_at exactly at created_at in that case and holds the task for up to
    // two days, so without this the shot span its generating animation for the
    // whole of it and the reserved credits were never returned. Settling it here
    // is the same contract the failed branch above already honours.
    if (isStalledVideoJob(job, task)) {
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: video generation was never started by the provider", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      const error = "The video provider accepted this job but never started it. Nothing was rendered and the credits have been returned. Try generating it again."
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "failed", error: { message: error }, completed_at: new Date().toISOString() }).eq("id", job.workflow_run_id)
      return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
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
