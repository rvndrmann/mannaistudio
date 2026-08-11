import type { SupabaseClient } from "@supabase/supabase-js"
import { generateOpenAIImage, type OpenAIImageModel } from "./openai"
import { submitBytePlusVideo } from "./byteplus"
import type { VideoGenerationModelId } from "./generation-models"
import { buildEntityMentionContext, type MentionableEntity } from "./entity-mentions"
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
          
          const mentionedEntityIds = Array.isArray(settings.mentionedEntityIds) ? settings.mentionedEntityIds : []
          const { data: mentionedEntities } = mentionedEntityIds.length
            ? await context.supabase.from("creator_entities").select("id,name,type,metadata,reference_images").in("id", mentionedEntityIds)
            : { data: [] }
            
          const mentionReferencePaths = (mentionedEntities || [])
            .flatMap((entity) => Array.isArray(entity.reference_images) ? (entity.reference_images as string[]) : [])
            .filter((path) => typeof path === "string" && path.length > 0)
            
          const combinedReferencePaths = Array.from(new Set([...mentionReferencePaths, ...referencePaths])).slice(0, 8)
          const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])

          const referenceUrls: string[] = []
          for (const ref of combinedReferencePaths) {
            if (/^https?:\/\//i.test(ref) || /^asset:\/\//i.test(ref) || /^asset-[a-z0-9-]+$/i.test(ref)) {
              referenceUrls.push(ref)
            } else {
              const { data } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(ref, 60 * 60)
              if (data?.signedUrl) referenceUrls.push(data.signedUrl)
            }
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

          } else if (job.type === "video" && job.provider === "byteplus") {
            const task = await submitBytePlusVideo({
              model: job.model as VideoGenerationModelId,
              prompt: job.prompt || "",
              duration: typeof settings.durationSeconds === "number" ? settings.durationSeconds : 4,
              resolution: typeof settings.resolution === "string" ? settings.resolution : "720p",
              ratio: effectiveAspectRatio,
              referenceUrls,
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
