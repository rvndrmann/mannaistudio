import { createClient } from "@supabase/supabase-js"
import { allowLongWaits } from "./long-budget"
import { submitProjectVideo } from "./project-video-submit"
import { requireAuthenticatedProject } from "./server-context"
import { STALLED_SUBMISSION_MS } from "./stalled-jobs"

/**
 * The background worker that submits a clip the request could not.
 *
 * Built into netlify/functions/submit-video-background.mjs, where Netlify gives
 * it fifteen minutes instead of a request's budget. It does one thing: carry an
 * already accepted job from its references to the provider's task id, with the
 * same code the route runs.
 *
 * It acts as the caller and nobody else. The request carries the user's own
 * access token, the client is built from it, and row-level security bounds
 * every read and write exactly as it does in the browser. Nothing starts here
 * that the user did not just ask for: one job, named by the request that
 * accepted it, and the worker ends when that job is submitted or has failed.
 *
 * Netlify answers the caller with 202 before this runs and ignores what it
 * returns, so every outcome is written to the job row, which is what the
 * workspace polls. It also retries a background function that throws, which is
 * why nothing is allowed to: a second run of a submission is a second clip.
 */
export default async function handler(request: Request): Promise<Response> {
  const done = new Response(null, { status: 202 })
  let beat: ReturnType<typeof setInterval> | undefined
  try {
    const authorization = request.headers.get("authorization") || ""
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    if (request.method !== "POST" || !authorization.startsWith("Bearer ") || !url || !anonKey) return done
    const { projectId, jobId, request: raw } = await request.json() as { projectId?: unknown; jobId?: unknown; request?: unknown }
    if (typeof projectId !== "string" || typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) return done

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const context = await requireAuthenticatedProject(projectId, supabase)
    allowLongWaits()
    // Waiting out the registration limit can take minutes, and a job that
    // looks untouched for six is taken over by recovery and submitted again.
    // Moving its clock while this is still working is what says it is not
    // abandoned. It only ever touches a job that has no provider task yet.
    beat = setInterval(() => {
      void supabase.from("creator_generation_jobs").update({ started_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "approved").is("provider_job_id", null).then(() => undefined, () => undefined)
    }, STALLED_SUBMISSION_MS / 4)
    const result = await submitProjectVideo(context, projectId, raw, { acceptedJobId: jobId })
    if (result.status >= 400) console.warn("submit-video-background: job", jobId, "ended with", result.status, result.body.error)
  } catch (error) {
    console.error("submit-video-background failed", error)
  } finally {
    if (beat) clearInterval(beat)
  }
  return done
}
