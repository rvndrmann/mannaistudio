import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { BytePlusProviderError, getBytePlusVideoTask, submitBytePlusVideo } from "@/lib/studio/byteplus"
import { isVideoGenerationModel } from "@/lib/studio/generation-models"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const submitSchema = z.object({
  shotId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(20_000),
  model: z.string().refine(isVideoGenerationModel, "Unsupported video model"),
  referenceImages: z.array(z.string().max(2_000)).max(50).default([]),
  generationMode: z.enum(["keyframe", "multi_image"]).default("keyframe"),
  startFrame: z.string().max(2_000).nullable().optional(),
  endFrame: z.string().max(2_000).nullable().optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"]).default("9:16"),
  resolution: z.enum(["480p", "720p"]).default("720p"),
  audioEnabled: z.boolean().default(true),
  durationSeconds: z.number().int().min(4).max(30).default(4),
}).strict()

async function verifyShot(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, projectId: string, shotId: string) {
  const { data: shot } = await context.supabase.from("creator_shots").select("id, episode_id, duration_seconds, aspect_ratio, resolution, metadata").eq("id", shotId).maybeSingle()
  if (!shot) return null
  const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", shot.episode_id).eq("project_id", projectId).maybeSingle()
  return episode ? shot : null
}

async function signedReferenceUrls(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, paths: string[]) {
  const urls: string[] = []
  for (const path of paths) {
    if (/^https?:\/\//i.test(path)) {
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
    const references = await signedReferenceUrls(context, input.referenceImages)
    const providerRequest = { prompt: input.prompt, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceImages: input.referenceImages, generationMode: input.generationMode, startFrame: input.startFrame || null, endFrame: input.endFrame || null, audioEnabled: input.audioEnabled }

    const { data: job, error: jobError } = await context.supabase.from("creator_generation_jobs").insert({
      user_id: context.user.id,
      project_id: projectId,
      shot_id: shot.id,
      type: "video",
      status: "approved",
      provider: "byteplus",
      model: input.model,
      prompt: input.prompt,
      input_images: input.referenceImages,
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
      const task = await submitBytePlusVideo({ model: input.model, prompt: input.prompt, duration: input.durationSeconds || Number(shot.duration_seconds || 5), resolution: input.resolution || shot.resolution || "720p", ratio: input.aspectRatio || shot.aspect_ratio || "9:16", referenceUrls: references, generationMode: input.generationMode, audioEnabled: input.audioEnabled })
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "processing", provider_job_id: task.id, provider_response: task.response }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "generating", duration_seconds: input.durationSeconds || shot.duration_seconds, aspect_ratio: input.aspectRatio || shot.aspect_ratio, resolution: input.resolution || shot.resolution, model: input.model, metadata: { ...(shot.metadata || {}), video_generation: { provider: "byteplus", model: input.model, prompt: input.prompt, reference_images: input.referenceImages, generation_mode: input.generationMode, start_frame: input.startFrame || null, end_frame: input.endFrame || null, aspect_ratio: input.aspectRatio, resolution: input.resolution, audio_enabled: input.audioEnabled, duration_seconds: input.durationSeconds, job_id: job.id, provider_job_id: task.id, status: "processing", requested_at: new Date().toISOString() } } }).eq("id", shot.id),
      ])
      return NextResponse.json({ jobId: job.id, providerJobId: task.id, status: "processing", provider: "byteplus", model: input.model }, { status: 202 })
    } catch (error) {
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", error: studioErrorMessage(error, "Submission failed"), completed_at: new Date().toISOString() }).eq("id", job.id),
        context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", shot.id),
      ])
      throw error
    }
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid video request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Video generation failed") }, { status: error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) })
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

    const task = await getBytePlusVideoTask(job.provider_job_id)
    if (task.status === "failed" || task.status === "cancelled") {
      const error = task.error?.message || `BytePlus task ${task.status}`
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: task.status === "cancelled" ? "cancelled" : "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      return NextResponse.json({ ...job, status: task.status === "cancelled" ? "cancelled" : "failed", error })
    }
    if (task.status !== "succeeded" || !task.content?.video_url) return NextResponse.json({ ...job, status: "processing", providerStatus: task.status })

    const output = await fetch(task.content.video_url)
    if (!output.ok) throw new BytePlusProviderError(`Could not download generated video (${output.status}).`)
    const storagePath = `${context.user.id}/${projectId}/byteplus-video-${randomUUID()}.mp4`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, Buffer.from(await output.arrayBuffer()), { contentType: "video/mp4", upsert: false })
    if (uploadError) throw uploadError
    const completedAt = new Date().toISOString()
    await Promise.all([
      context.supabase.from("creator_generation_jobs").update({ status: "completed", provider_response: task, result_url: storagePath, completed_at: completedAt }).eq("id", job.id),
      job.shot_id ? context.supabase.from("creator_shots").update({ video_url: storagePath, video_status: "completed" }).eq("id", job.shot_id) : Promise.resolve(),
    ])
    return NextResponse.json({ ...job, status: "completed", result_url: storagePath, completed_at: completedAt })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check video status") }, { status: error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) })
  }
}
