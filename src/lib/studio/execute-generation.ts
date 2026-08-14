import type { SupabaseClient } from "@supabase/supabase-js"
import { generateOpenAIImage, type OpenAIImageModel } from "./openai"
import { submitBytePlusVideo, generateBytePlusImage, createBytePlusAsset } from "./byteplus"
import type { VideoGenerationModelId, ImageGenerationModelId } from "./generation-models"
import { buildEntityMentionContext, chosenReferences, entityPrimaryReference, findShotCastEntityIds, type MentionableEntity } from "./entity-mentions"
import { openAIImageQuality, projectImageQuality, projectVisualStyle, visualStyleDirective } from "./entity-image-workflow"
import { stripIdentityDescriptions } from "./prompt-sanitizer"
import { resolveRegisteredAsset } from "./byteplus-assets"
import type { AuthenticatedProjectContext } from "./server-context"
import { randomUUID } from "node:crypto"
import { verifyGenerationTarget } from "./generation-target"
import { refundGenerationCredits } from "./credits"
import { parseSeedanceMissingAssetError, purgeStaleBytePlusAsset } from "./seedance-reference-error"

async function verifyAttachedOutput(context: AuthenticatedProjectContext, job: Record<string, unknown>, resultPath: string) {
  if (typeof job.shot_id !== "string") throw new Error("Generation completed without a target shot")
  const { data: shot, error } = await context.supabase
    .from("creator_shots")
    .select("id,episode_id,prompt,referenced_entities,keyframe_image,video_url")
    .eq("id", job.shot_id)
    .maybeSingle()
  if (error) throw error
  if (!shot) throw new Error("Generation target shot no longer exists")
  const target = job.target_snapshot && typeof job.target_snapshot === "object" ? job.target_snapshot as Record<string, unknown> : {}
  const mediaField = job.type === "video" ? "video_url" : "keyframe_image"
  const result = verifyGenerationTarget({ target, actual: { shotId: shot.id, episodeId: shot.episode_id, prompt: typeof job.prompt === "string" ? job.prompt : "", entityReferenceIds: Array.isArray(shot.referenced_entities) ? shot.referenced_entities : [], resultPath: shot[mediaField] }, expectedResultPath: resultPath })
  if (!result.ok) throw new Error(`Generation verification failed: ${Object.entries(result.checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`)
  return { status: "verified", checkedAt: new Date().toISOString(), checks: result.checks, resultPath }
}

async function settleWorkflowRun(context: AuthenticatedProjectContext, workflowRunId: unknown) {
  if (typeof workflowRunId !== "string") return
  const { data: jobs } = await context.supabase.from("creator_generation_jobs").select("status,error").eq("workflow_run_id", workflowRunId)
  if (!jobs?.length) return
  const active = jobs.some((job) => ["queued", "approved", "generating", "processing"].includes(job.status))
  if (active) return
  const failed = jobs.filter((job) => job.status === "failed")
  const completed = jobs.filter((job) => job.status === "completed")
  const status = failed.length ? (completed.length ? "partially_completed" : "failed") : "completed"
  await context.supabase.from("creator_workflow_runs").update({
    status,
    completed_at: new Date().toISOString(),
    summary: { generationJobs: jobs.length, completed: completed.length, failed: failed.length, verified: completed.length },
    error: failed.length ? { jobs: failed.map((job) => job.error).filter(Boolean) } : null,
  }).eq("id", workflowRunId)
}

async function withGenerationRetry<T>(context: AuthenticatedProjectContext, job: Record<string, unknown>, operation: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt === 3) break
      await context.supabase.from("creator_generation_job_events").insert({ job_id: job.id, status: "processing", details: { phase: "retrying", attempt: attempt + 1, message: error instanceof Error ? error.message : "Provider request failed" } })
      if (typeof job.workflow_run_id === "string") await context.supabase.from("creator_workflow_runs").update({ status: "retrying", summary: { jobId: job.id, nextAttempt: attempt + 1 } }).eq("id", job.workflow_run_id)
      await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }
  throw lastError
}

export async function executeGenerationJobsInBackground(
  context: AuthenticatedProjectContext,
  jobIds: string[]
) {
  // We run this without awaiting to not block the request
  void (async () => {
    try {
      const { data: jobs, error: jobsError } = await context.supabase
        .from("creator_generation_jobs")
        .select("*")
        .in("id", jobIds)
      
      if (jobsError || !jobs?.length) return

      for (const job of jobs) {
        try {
          if (job.status !== "approved") continue

          // Mark as generating
          await context.supabase
            .from("creator_generation_jobs")
            .update({ status: "generating", requested_at: new Date().toISOString() })
            .eq("id", job.id)

          const style = projectVisualStyle(context.project)
          const projectDefaultAspect = typeof context.project.default_aspect === "string" ? context.project.default_aspect : null
          const settings = (job.settings as Record<string, unknown>) || {}
          const effectiveAspectRatio = typeof settings.aspectRatio === "string" ? settings.aspectRatio : projectDefaultAspect || "9:16"
          const referencePaths = Array.isArray(job.input_images) ? (job.input_images as string[]) : []
          
          // A shot is referenced by what its own prompt names, not by everything
          // the project owns. Reading the @mentions out of the prompt keeps an
          // unrelated character or prop from being fed into the frame.
          const { data: projectEntities } = await context.supabase
            .from("creator_entities").select("*").eq("project_id", context.project.id)
          // The shot's own cast, which is what the storyboard displays. Reading
          // it here is what makes generation reference exactly what the user can
          // see listed against that shot.
          const { data: castShot } = job.shot_id
            ? await context.supabase.from("creator_shots").select("referenced_entities,metadata").eq("id", job.shot_id).maybeSingle()
            : { data: null }
          const shotCastIds = Array.isArray(castShot?.referenced_entities) ? castShot.referenced_entities as string[] : []
          const curated = Boolean((castShot?.metadata as { cast_curated?: boolean } | null)?.cast_curated)
          const declaredIds = Array.from(new Set([
            ...(Array.isArray(settings.mentionedEntityIds) ? settings.mentionedEntityIds as string[] : []),
            ...shotCastIds,
          ]))
          // A cast the user picked by hand is deliberate and is used as-is.
          // Otherwise the prompt decides, with the declared list confirming
          // anything it names in prose rather than with an @mention.
          // A hand-curated strip on the approval card outranks everything: the
          // user looked at the references and said which ones to send.
          const pickedIds = Array.isArray(settings.entityReferenceIds) ? settings.entityReferenceIds as string[] : null
          const promptMentionIds = pickedIds
            ? pickedIds
            : curated
            ? shotCastIds
            : findShotCastEntityIds(job.prompt || "", (projectEntities || []) as MentionableEntity[], declaredIds)
          // An empty picked list means "no entity references", not "fall back".
          const activeIds = pickedIds ? pickedIds : promptMentionIds.length ? promptMentionIds : declaredIds
          const mentionedEntities = (projectEntities || []).filter((entity) => activeIds.includes(entity.id))

          // GPT Image takes up to 16 references, so a large cast no longer loses
          // its last members to a budget inherited from the video path. Seedance
          // stays on the eight it was tuned against.
          const referenceBudget = job.type === "image" && job.provider === "openai" ? 16 : 8
          // One image per entity — the one the user chose. The rest of an
          // entity's images are rejected attempts, and the model would blend
          // them into the keeper.
          const mentionReferencePaths = chosenReferences(mentionedEntities as MentionableEntity[], referenceBudget)
          // Only a character's image needs registering with the provider to
          // clear its real-person check; the Asset Library holds 50 and props
          // and locations would fill it for nothing.
          const facePaths = new Set(mentionedEntities
            .filter((entity) => entity.type === "character")
            .map((entity) => entityPrimaryReference(entity as MentionableEntity))
            .filter((path): path is string => Boolean(path)))
          // A storyboard keyframe is a rendered frame of those same characters,
          // so BytePlus rejects it as a real person exactly like a face photo —
          // "input image content[1] may contain real person". A continuation
          // shot always sends its keyframe as the composition reference, so
          // without registering it too, continuity generation fails every time
          // on a photoreal project.
          for (const path of referencePaths) {
            if (typeof path === "string" && path.trim()) facePaths.add(path)
          }

          // Video continuation names its target storyboard frame as [Image 1],
          // so keep shot-owned composition images ahead of cast references.
          const combinedReferencePaths = Array.from(new Set(
            job.type === "video"
              ? [...referencePaths, ...mentionReferencePaths]
              : [...mentionReferencePaths, ...referencePaths],
          )).slice(0, referenceBudget)
          const mentionContext = buildEntityMentionContext(mentionedEntities as MentionableEntity[])

          const signReference = async (ref: string) => {
            if (/^https?:\/\//i.test(ref) || /^asset:\/\//i.test(ref) || /^asset-[a-z0-9-]+$/i.test(ref)) return ref
            const { data } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(ref, 60 * 60)
            return data?.signedUrl || null
          }

          const referenceUrls: string[] = []
          const faceReferenceUrls: string[] = []
          const entityIdByPath = new Map(mentionedEntities
            .map((entity) => [entityPrimaryReference(entity as MentionableEntity), entity.id] as const)
            .filter((pair): pair is readonly [string, string] => Boolean(pair[0])))
          for (const ref of combinedReferencePaths) {
            const signed = await signReference(ref)
            if (!signed) continue
            // An image that must clear the provider's real-person check is
            // registered once and remembered. Registering per generation filled
            // the account's 50-image library within hours, and re-registered the
            // same character even for requests the provider had rejected.
            if (facePaths.has(ref) && job.provider === "byteplus") {
              const assetUri = await resolveRegisteredAsset({
                supabase: context.supabase,
                sourcePath: ref,
                imageUrl: signed,
                name: ref.split("/").pop() || undefined,
                projectId: context.project.id,
                entityId: entityIdByPath.get(ref) || null,
                userId: context.user.id,
              })
              if (assetUri) {
                referenceUrls.push(assetUri)
                continue
              }
            }
            referenceUrls.push(signed)
            if (facePaths.has(ref)) faceReferenceUrls.push(signed)
          }

          // Seedance takes clips alongside images so a shot can inherit motion
          // and look from an earlier shot's video. These travel separately
          // because the provider requires URLs for video, not inline data.
          const videoReferencePaths = (Array.isArray(settings.videoReferencePaths) ? settings.videoReferencePaths as string[] : []).slice(0, 10)
          const videoReferenceUrls: string[] = []
          for (const ref of videoReferencePaths) {
            const signed = await signReference(ref)
            if (signed) videoReferenceUrls.push(signed)
          }

          // The job was written with only the composition frames the request
          // named; the cast is resolved here, from the prompt. Recording what is
          // actually being sent is what lets the shot's panel show the same
          // references the chat card promised — and leaves a true record on a
          // job that fails.
          await context.supabase.from("creator_generation_jobs").update({
            input_images: combinedReferencePaths,
            settings: { ...settings, videoReferencePaths, resolvedReferencePaths: combinedReferencePaths, resolvedEntityIds: mentionedEntities.map((entity) => entity.id) },
          }).eq("id", job.id)

          if (job.type === "image" && job.provider === "openai") {
            const resolvedPrompt = [stripIdentityDescriptions(job.prompt || ""), `Required composition: ${effectiveAspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
            const imageBuffer = await withGenerationRetry(context, job, () => generateOpenAIImage({
              userId: context.user.id,
              model: job.model as OpenAIImageModel,
              prompt: resolvedPrompt,
              referenceUrls,
              aspectRatio: effectiveAspectRatio,
              quality: openAIImageQuality(projectImageQuality(context.project)),
            }))
            
            const path = `${context.user.id}/${context.project.id}/shots/${job.shot_id}/${job.model}-${randomUUID()}.png`
            await context.supabase.storage.from("creator-studio-media").upload(path, imageBuffer, { contentType: "image/png" })
            
            await context.supabase.from("creator_shots").update({
              keyframe_image: path,
            }).eq("id", job.shot_id)

            const verification = await verifyAttachedOutput(context, job, path)
            await context.supabase.from("creator_generation_jobs").update({
              status: "completed",
              result_url: path,
              verification,
              completed_at: new Date().toISOString(),
            }).eq("id", job.id)
            await settleWorkflowRun(context, job.workflow_run_id)

          } else if (job.type === "image" && job.provider === "byteplus") {
            const resolvedPrompt = [stripIdentityDescriptions(job.prompt || ""), `Required composition: ${effectiveAspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
            const generated = await withGenerationRetry(context, job, () => generateBytePlusImage({
              model: job.model as ImageGenerationModelId,
              prompt: resolvedPrompt,
              referenceUrls,
            }))
            
            let byteplusAssetId: string | null = null
            let byteplusAssetUri: string | null = null
            try {
              const assetRes = await createBytePlusAsset({ imageUrl: generated.url, name: job.prompt.slice(0, 50) })
              byteplusAssetId = assetRes.assetId
              byteplusAssetUri = `asset://${assetRes.assetId}`
            } catch (assetErr) {
              console.warn("Could not auto-register Seedream output as BytePlus asset:", assetErr)
            }
            
            const download = await fetch(generated.url)
            if (!download.ok) throw new Error(`Could not download Seedream output (${download.status}).`)
            const imageBuffer = Buffer.from(await download.arrayBuffer())
            
            const path = `${context.user.id}/${context.project.id}/shots/${job.shot_id}/${job.model}-${randomUUID()}.png`
            await context.supabase.storage.from("creator-studio-media").upload(path, imageBuffer, { contentType: generated.contentType })
            
            await context.supabase.from("creator_shots").update({
              keyframe_image: path,
              is_trusted_provider_asset: Boolean(byteplusAssetUri),
              provider_asset_uri: byteplusAssetUri || null,
            }).eq("id", job.shot_id)

            const verification = await verifyAttachedOutput(context, job, path)
            await context.supabase.from("creator_generation_jobs").update({
              status: "completed",
              result_url: path,
              verification,
              completed_at: new Date().toISOString(),
            }).eq("id", job.id)
            await settleWorkflowRun(context, job.workflow_run_id)

          } else if (job.type === "video" && job.provider === "byteplus") {
            let task: { id: string; response?: unknown }
            try {
              task = await submitBytePlusVideo({
                model: job.model as VideoGenerationModelId,
                prompt: job.prompt || "",
                duration: typeof settings.durationSeconds === "number" ? settings.durationSeconds : 4,
                resolution: typeof settings.resolution === "string" ? settings.resolution : "720p",
                ratio: effectiveAspectRatio,
                referenceUrls,
                faceReferenceUrls,
                videoReferenceUrls,
                generationMode: settings.generationMode === "multi_image" ? "multi_image" : "keyframe",
                audioEnabled: typeof settings.audioEnabled === "boolean" ? settings.audioEnabled : true,
              })
            } catch (videoErr) {
              const errMsg = videoErr instanceof Error ? videoErr.message : "Video submission failed"
              const missingAsset = parseSeedanceMissingAssetError(errMsg)
              if (missingAsset?.assetId) {
                await purgeStaleBytePlusAsset(context.supabase, missingAsset.assetId, context.project.id)
                // Re-resolve reference URLs with fresh active registration
                const freshRefUrls: string[] = []
                const freshFaceRefUrls: string[] = []
                for (const ref of combinedReferencePaths) {
                  const signed = await signReference(ref)
                  if (!signed) continue
                  if (facePaths.has(ref)) {
                    const assetUri = await resolveRegisteredAsset({
                      supabase: context.supabase,
                      sourcePath: ref,
                      imageUrl: signed,
                      name: ref.split("/").pop() || undefined,
                      projectId: context.project.id,
                      userId: context.user.id,
                    })
                    if (assetUri) {
                      freshRefUrls.push(assetUri)
                      continue
                    }
                  }
                  freshRefUrls.push(signed)
                  if (facePaths.has(ref)) freshFaceRefUrls.push(signed)
                }
                task = await submitBytePlusVideo({
                  model: job.model as VideoGenerationModelId,
                  prompt: job.prompt || "",
                  duration: typeof settings.durationSeconds === "number" ? settings.durationSeconds : 4,
                  resolution: typeof settings.resolution === "string" ? settings.resolution : "720p",
                  ratio: effectiveAspectRatio,
                  referenceUrls: freshRefUrls,
                  faceReferenceUrls: freshFaceRefUrls,
                  videoReferenceUrls,
                  generationMode: settings.generationMode === "multi_image" ? "multi_image" : "keyframe",
                  audioEnabled: typeof settings.audioEnabled === "boolean" ? settings.audioEnabled : true,
                })
              } else {
                throw videoErr
              }
            }
            
            await context.supabase.from("creator_generation_jobs").update({
              status: "processing",
              provider_job_id: task.id,
              provider_response: task,
            }).eq("id", job.id)
            
          } else {
            throw new Error(`Unsupported background generation for ${job.type} / ${job.provider}`)
          }
        } catch (err) {
          console.error(`Failed to process generation job ${job.id}:`, err)
          await context.supabase.from("creator_generation_jobs").update({
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          }).eq("id", job.id)
          const charged = Number(job.credits_used || job.estimated_credits || 0)
          if (charged > 0) {
            try {
              await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: failed AI Director generation", job.id, context.supabase)
            } catch (refundError) {
              console.error(`Could not refund generation job ${job.id}:`, refundError)
            }
          }
          await settleWorkflowRun(context, job.workflow_run_id)
        }
      }
    } catch (err) {
      console.error("Background generation loop failed:", err)
    }
  })()
}
