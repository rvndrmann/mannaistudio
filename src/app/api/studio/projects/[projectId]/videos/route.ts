import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { BytePlusProviderError, bytePlusVideoReferenceLimit, createBytePlusAsset, getBytePlusAsset, getBytePlusVideoTask, submitBytePlusVideo } from "@/lib/studio/byteplus"
import { FalProviderError, getFalVideoTask, submitFalVideo } from "@/lib/studio/fal"
import { getGoogleVideoTask, GoogleProviderError, submitGoogleVideo } from "@/lib/studio/google"
import { generationProvider, isVideoGenerationModel } from "@/lib/studio/generation-models"
import { calculateCreditCost, deductUserCredits } from "@/lib/studio/credits"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { buildEntityMentionContext, entityPrimaryReference, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { projectVisualStyle, visualStyleDirective } from "@/lib/studio/entity-image-workflow"

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

    // Resolve canonical character, scene, and prop references plus direct shot references.
    let combinedReferencePaths: string[] = []
    const rawImagesToOmit = new Set<string>()

    // Check if shot keyframe image has a registered BytePlus asset ID in metadata
    const shotMeta = (shot.metadata as Record<string, unknown>) || {}
    const shotBytePlusAssetId = typeof shotMeta.byteplus_asset_id === "string" && shotMeta.byteplus_asset_id.trim() ? shotMeta.byteplus_asset_id.trim() : null

    if (provider === "byteplus" && shotBytePlusAssetId) {
      combinedReferencePaths.push(shotBytePlusAssetId)
      if (shot.keyframe_image) rawImagesToOmit.add(shot.keyframe_image)
    } else if (shot.keyframe_image && !input.startFrame) {
      combinedReferencePaths.push(shot.keyframe_image)
    }

    if (resolvedEntities && resolvedEntities.length > 0) {
      for (const entity of resolvedEntities) {
        const byteplusAssetId = typeof entity.metadata === "object" && entity.metadata !== null ? (entity.metadata as Record<string, unknown>).byteplus_asset_id : null

        if (provider === "byteplus" && typeof byteplusAssetId === "string" && byteplusAssetId.trim()) {
          combinedReferencePaths.push(byteplusAssetId.trim())
          // Omit raw duplicates when BytePlus can use its canonical provider asset.
          if (Array.isArray(entity.reference_images)) {
            for (const img of entity.reference_images) {
              if (typeof img === "string" && img.trim()) {
                rawImagesToOmit.add(img.trim())
              }
            }
          }
        } else {
          // One image per entity: its chosen reference. Pushing every image an
          // entity owns fills the reference budget with a few subjects and
          // drops the rest of the cast before the provider sees it.
          const chosen = entityPrimaryReference(entity as MentionableEntity)
          if (chosen) combinedReferencePaths.push(chosen.trim())
        }
      }
    }

    // Include direct shot reference images
    for (const refPath of input.referenceImages) {
      if (rawImagesToOmit.has(refPath)) continue
      combinedReferencePaths.push(refPath)
    }

    // Deduplicate reference paths
    combinedReferencePaths = Array.from(new Set(combinedReferencePaths))

    const references = await signedReferenceUrls(context, combinedReferencePaths)

    // Seedance accepts finished clips as references, so a shot can inherit the
    // motion and look of the one before it instead of restarting cold.
    const videoReferencePaths = [...input.referenceVideos]
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
    const resolvedPrompt = [input.prompt, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
    const providerRequest = { prompt: resolvedPrompt, originalPrompt: input.prompt, style, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceImages: combinedReferencePaths, characterEntityIds: input.characterEntityIds, mentionedEntityIds: input.mentionedEntityIds, resolvedEntityIds, generationMode: input.generationMode, startFrame: input.startFrame || null, endFrame: input.endFrame || null, audioEnabled: input.audioEnabled }

    const { data: job, error: jobError } = await context.supabase.from("creator_generation_jobs").insert({
      user_id: context.user.id,
      project_id: projectId,
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
    }).select("*").single()
    if (jobError) throw jobError

    try {
      let task: { id: string; response?: unknown }
      if (provider === "fal") {
        const falRes = await submitFalVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references })
        task = { id: falRes.id, response: falRes }
      } else if (provider === "google") {
        const gRes = await submitGoogleVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 4), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references })
        task = { id: gRes.id, response: gRes.response }
      } else {
        const bpRes = await submitBytePlusVideo({ model: input.model, prompt: resolvedPrompt, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references, videoReferenceUrls: videoReferences, generationMode: input.generationMode, audioEnabled: input.audioEnabled })
        task = { id: bpRes.id, response: bpRes.response }
      }
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "processing", provider_job_id: task.id, provider_response: task.response }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...resolvedEntityIds])), metadata: { ...(shot.metadata || {}), video_generation: { provider, model: input.model, prompt: input.prompt, resolved_prompt: resolvedPrompt, style, reference_images: combinedReferencePaths, character_entity_ids: input.characterEntityIds, mentioned_entity_ids: input.mentionedEntityIds, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
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
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", error: studioErrorMessage(error, "Submission failed"), completed_at: new Date().toISOString() }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", shot.id),
      ])
      throw error
    }
  } catch (error) {
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
      const endpoint = (job.provider_response as Record<string, unknown>)?.endpoint as string || "bytedance/seedance-2.0/image-to-video"
      task = await getFalVideoTask(job.provider_job_id, endpoint)
    } else if (provider === "google") {
      task = await getGoogleVideoTask(job.provider_job_id)
    } else {
      task = await getBytePlusVideoTask(job.provider_job_id)
    }

    if (task.status === "failed" || task.status === "cancelled") {
      const error = task.error?.message || `${provider} task ${task.status}`
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: task.status === "cancelled" ? "cancelled" : "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      return NextResponse.json({ ...job, status: task.status === "cancelled" ? "cancelled" : "failed", error })
    }
    if (task.status !== "succeeded" || !task.content?.video_url) return NextResponse.json({ ...job, status: "processing", providerStatus: task.status })

    const output = await fetch(task.content.video_url)
    if (!output.ok) throw new BytePlusProviderError(`Could not download generated video (${output.status}).`)
    const storagePath = `${context.user.id}/${projectId}/${provider}-video-${randomUUID()}.mp4`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, Buffer.from(await output.arrayBuffer()), { contentType: "video/mp4", upsert: false })
    if (uploadError) throw uploadError
    const completedAt = new Date().toISOString()
    await Promise.all([
      context.supabase.from("creator_generation_jobs").update({ status: "completed", provider_response: task, result_url: storagePath, completed_at: completedAt }).eq("id", job.id),
      job.shot_id ? context.supabase.from("creator_shots").update({ video_url: storagePath, video_status: "completed" }).eq("id", job.shot_id) : Promise.resolve(),
    ])
    return NextResponse.json({ ...job, status: "completed", result_url: storagePath, completed_at: completedAt })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check video status") }, { status: error instanceof BytePlusProviderError || error instanceof FalProviderError ? error.status : studioErrorStatus(error) })
  }
}
