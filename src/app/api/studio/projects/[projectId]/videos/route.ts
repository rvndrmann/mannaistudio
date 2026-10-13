import { NextRequest, NextResponse } from "next/server"
import { pollVideos } from "@/lib/studio/poll-videos"
import { submitProjectVideo } from "@/lib/studio/project-video-submit"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { handOffVideoSubmission, submitsOnVideoWorker } from "@/lib/studio/video-handoff"

/**
 * Submits one clip.
 *
 * The submission itself is submitProjectVideo. What this route decides is where
 * it runs. Most providers take one call, so it runs here and its answer — the
 * task id, or the provider's refusal — goes straight back. BytePlus has to
 * register each new reference first, at three a minute, and the host stops a
 * request long before a shot with several of them is ready: the clip was then
 * only submitted six minutes later, by recovery. So for BytePlus this accepts
 * the job, hands it to the background worker, and answers at once; the
 * workspace follows the job from there, as it does every render.
 *
 * `maxDuration` is deliberately absent. It is a Vercel directive and the host
 * this runs on ignores it, so setting it only made the limit look handled.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const raw = await request.json() as { model?: unknown }
    // The site's own address where the host provides it: a request can arrive
    // through a proxy whose origin is not one the worker is served from.
    const origin = process.env.URL || request.nextUrl.origin

    if (submitsOnVideoWorker(raw?.model, origin)) {
      const accepted = await submitProjectVideo(context, projectId, raw, { acceptOnly: true })
      const jobId = typeof accepted.body.jobId === "string" ? accepted.body.jobId : null
      if (accepted.body.status !== "accepted" || !jobId) return NextResponse.json(accepted.body, { status: accepted.status })
      const { data: { session } } = await context.supabase.auth.getSession()
      const handed = session?.access_token
        ? await handOffVideoSubmission({ origin, accessToken: session.access_token, projectId, jobId, request: raw })
        : false
      if (handed) return NextResponse.json({ ...accepted.body, status: "processing", submitting: true }, { status: 202 })
      // No worker took it, so it is submitted here as it always was. The job's
      // claim settles it if the worker did start and only its answer was lost.
      const result = await submitProjectVideo(context, projectId, raw, { acceptedJobId: jobId })
      return NextResponse.json(result.body, { status: result.status })
    }

    const result = await submitProjectVideo(context, projectId, raw)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Video generation failed") }, { status: studioErrorStatus(error) })
  }
}

export async function GET(request: NextRequest, options: { params: Promise<{ projectId: string }> }) {
  return pollVideos(request, options)
}
