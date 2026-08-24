// Longer than the image route is allowed to run (its maxDuration is 300s), so a
// job still unfinished past this point cannot have a process behind it any more
// — image generation is synchronous, with no provider job left to poll.
export const STALLED_IMAGE_JOB_MS = 6 * 60 * 1000

// Every non-terminal state, not only `processing`. A run killed between approval
// and the first provider call leaves the row in `approved` (or `queued` /
// `generating`); reconciling only `processing` left those to spin for ever.
const ACTIVE_JOB_STATUSES = ["queued", "approved", "generating", "processing"]

/**
 * Whether an image job is an orphan the server never got to finish.
 *
 * True only for a job in a non-terminal state that has sat there longer than any
 * real generation takes — the run that owned it is gone, so the workspace can
 * settle it as failed and refund it. A job that never reached `processing` has
 * no started_at, so the clock falls back to approved_at and then created_at,
 * otherwise an `approved` orphan reads as age zero and is never settled.
 */
export function isStalledImageJob(
  job: { status?: string | null; started_at?: string | null; approved_at?: string | null; created_at?: string | null },
  now: number = Date.now(),
): boolean {
  if (!job.status || !ACTIVE_JOB_STATUSES.includes(job.status)) return false
  const clock = Date.parse(job.started_at || job.approved_at || job.created_at || "")
  if (Number.isNaN(clock)) return false
  return now - clock >= STALLED_IMAGE_JOB_MS
}
