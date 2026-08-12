import type { SupabaseClient } from "@supabase/supabase-js"
import { generateOpenAIImage, type OpenAIImageModel } from "./openai"
import { submitBytePlusVideo, generateBytePlusImage, createBytePlusAsset } from "./byteplus"
import type { VideoGenerationModelId, ImageGenerationModelId } from "./generation-models"
import { buildEntityMentionContext, entityPrimaryReference, findShotCastEntityIds, type MentionableEntity } from "./entity-mentions"
import { projectVisualStyle, visualStyleDirective } from "./entity-image-workflow"
import type { AuthenticatedProjectContext } from "./server-context"
import { randomUUID } from "node:crypto"

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
            .from("creator_entities").select("id,name,type,metadata,reference_images,primary_reference_image").eq("project_id", context.project.id)
          const declaredIds = Array.isArray(settings.mentionedEntityIds) ? settings.mentionedEntityIds as string[] : []
          const promptMentionIds = findShotCastEntityIds(job.prompt || "", (projectEntities || []) as MentionableEntity[], declaredIds)
          // The prompt wins when it names anyone; the declared list is only the
          // fallback for a prompt written without mentions.
          const activeIds = promptMentionIds.length ? promptMentionIds : declaredIds
          const mentionedEntities = (projectEntities || []).filter((entity) => activeIds.includes(entity.id))

          // One image per entity — the chosen reference. Sending every image an
          // entity owns burns the reference budget on two or three characters
          // and drops the rest of the shot's cast entirely.
          const mentionReferencePaths = mentionedEntities
            .map((entity) => entityPrimaryReference(entity as MentionableEntity))
            .filter((path): path is string => Boolean(path))

          const combinedReferencePaths = Array.from(new Set([...mentionReferencePaths, ...referencePaths])).slice(0, 8)
          const mentionContext = buildEntityMentionContext(mentionedEntities as MentionableEntity[])

          const signReference = async (ref: string) => {
            if (/^https?:\/\//i.test(ref) || /^asset:\/\//i.test(ref) || /^asset-[a-z0-9-]+$/i.test(ref)) return ref
            const { data } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(ref, 60 * 60)
            return data?.signedUrl || null
          }

          const referenceUrls: string[] = []
          for (const ref of combinedReferencePaths) {
            const signed = await signReference(ref)
            if (signed) referenceUrls.push(signed)
          }

          // Seedance takes clips alongside images so a shot can inherit motion
          // and look from an earlier shot's video. These travel separately
          // because the provider requires URLs for video, not inline data.
          const videoReferenceUrls: string[] = []
          for (const ref of (Array.isArray(settings.videoReferencePaths) ? settings.videoReferencePaths as string[] : []).slice(0, 10)) {
            const signed = await signReference(ref)
            if (signed) videoReferenceUrls.push(signed)
          }

          if (job.type === "image" && job.provider === "openai") {
            const resolvedPrompt = [job.prompt, `Required composition: ${effectiveAspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
            const imageBuffer = await generateOpenAIImage({
              userId: context.user.id,
              model: job.model as OpenAIImageModel,
              prompt: resolvedPrompt,
              referenceUrls,
              aspectRatio: effectiveAspectRatio,
            })
            
            const path = `${context.user.id}/${context.project.id}/shots/${job.shot_id}/${job.model}-${randomUUID()}.png`
            await context.supabase.storage.from("creator-studio-media").upload(path, imageBuffer, { contentType: "image/png" })
            
            await context.supabase.from("creator_generation_jobs").update({
              status: "completed",
              result_url: path,
              completed_at: new Date().toISOString(),
            }).eq("id", job.id)

            await context.supabase.from("creator_shots").update({
              keyframe_image: path,
            }).eq("id", job.shot_id)

          } else if (job.type === "image" && job.provider === "byteplus") {
            const resolvedPrompt = [job.prompt, `Required composition: ${effectiveAspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
            const generated = await generateBytePlusImage({
              model: job.model as ImageGenerationModelId,
              prompt: resolvedPrompt,
              referenceUrls,
            })
            
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
            
            await context.supabase.from("creator_generation_jobs").update({
              status: "completed",
              result_url: path,
              completed_at: new Date().toISOString(),
            }).eq("id", job.id)

            await context.supabase.from("creator_shots").update({
              keyframe_image: path,
              is_trusted_provider_asset: Boolean(byteplusAssetUri),
              provider_asset_uri: byteplusAssetUri || null,
            }).eq("id", job.shot_id)

          } else if (job.type === "video" && job.provider === "byteplus") {
            const task = await submitBytePlusVideo({
              model: job.model as VideoGenerationModelId,
              prompt: job.prompt || "",
              duration: typeof settings.durationSeconds === "number" ? settings.durationSeconds : 4,
              resolution: typeof settings.resolution === "string" ? settings.resolution : "720p",
              ratio: effectiveAspectRatio,
              referenceUrls,
              videoReferenceUrls,
              generationMode: settings.generationMode === "multi_image" ? "multi_image" : "keyframe",
              audioEnabled: typeof settings.audioEnabled === "boolean" ? settings.audioEnabled : true,
            })
            
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
        }
      }
    } catch (err) {
      console.error("Background generation loop failed:", err)
    }
  })()
}
