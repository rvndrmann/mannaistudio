import { NextRequest } from "next/server"
import type { AuthenticatedProjectContext } from "./server-context"
import { pollImages } from "./poll-images"
import { pollVideos } from "./poll-videos"

/**
 * Moves a project's unfinished generation jobs forward, with nobody watching.
 *
 * A video, and an image on a provider that renders asynchronously, is handed to
 * the provider and then finished by a later request that asks how it went and
 * saves the result. The studio page sends that request on a timer. A caller
 * with no page open — an assistant working over MCP — never does, so its jobs
 * sat at "processing" until somebody opened the project in a browser.
 *
 * This is that same request, made on the caller's behalf. It reuses the poll
 * functions rather than restating them, so a job is claimed, recovered, charged
 * and refunded by exactly the rules the page already relies on, including
 * picking up an approved job whose background worker never reached it.
 */

const ACTIVE = ["queued", "approved", "generating", "processing"]
// A handful per call: each one is a provider round trip, and the caller is
// waiting on a tool result. Anything left over is picked up by the next call.
const MAX_JOBS = 8
// A job being claimed here can run a whole synchronous render. The caller gets
// its answer after this long either way; the work carries on behind it.
const WAIT_MS = 40_000

export async function advanceGenerationJobs(context: AuthenticatedProjectContext, origin: string, waitMs = WAIT_MS) {
  const { data, error } = await context.supabase
    .from("creator_generation_jobs")
    .select("id,type")
    .eq("project_id", context.project.id)
    .eq("user_id", context.user.id)
    .in("status", ACTIVE)
    .in("type", ["image", "video"])
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS)
  if (error) throw error
  const jobs = data || []
  if (!jobs.length) return { checked: 0, stillWorking: false }

  const projectId = String(context.project.id)
  const params = { params: Promise.resolve({ projectId }) }
  const work = Promise.allSettled(jobs.map((job) => {
    const kind = job.type === "video" ? "videos" : "images"
    const request = new NextRequest(`${origin}/api/studio/projects/${projectId}/${kind}?jobId=${job.id}`)
    return (job.type === "video" ? pollVideos : pollImages)(request, params, context)
  }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const finished = await Promise.race([
    work.then(() => true),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), waitMs) }),
  ])
  clearTimeout(timer)
  return { checked: jobs.length, stillWorking: !finished }
}
