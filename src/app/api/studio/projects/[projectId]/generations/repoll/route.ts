import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { pollImages } from "@/lib/studio/poll-images"
import { pollVideos } from "@/lib/studio/poll-videos"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const { jobId } = z.object({ jobId: z.string().uuid() }).strict().parse(await request.json())
    const { data: job, error } = await context.supabase.from("creator_generation_jobs").select("id,type,provider_job_id").eq("id", jobId).eq("project_id", projectId).eq("user_id", context.user.id).maybeSingle()
    if (error) throw error
    if (!job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 })
    if (!job.provider_job_id) return NextResponse.json({ error: "No provider ID was saved for this job. It cannot be re-polled." }, { status: 409 })
    if (!["image", "video"].includes(job.type)) return NextResponse.json({ error: "Unsupported generation type" }, { status: 400 })
    const url = new URL(request.url)
    url.searchParams.set("jobId", jobId)
    return (job.type === "image" ? pollImages : pollVideos)(new NextRequest(url), { params: Promise.resolve({ projectId }) }, context, true)
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not re-poll generation") }, { status: error instanceof z.ZodError ? 400 : studioErrorStatus(error) })
  }
}
