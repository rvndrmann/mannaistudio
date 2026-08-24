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

// Long enough that a normal Seedance render — a few minutes for a heavy request
// on a busy tier — has finished, but short enough that a user is not made to
// watch a spinner for an hour before the workspace admits the provider is not
// coming back. Video work is async: BytePlus accepts a task and either updates
// its own `updated_at` as it progresses, or leaves the timestamp exactly at
// `created_at` when the queue never picked the task up. The second case is the
// stall this exists to settle.
export const STALLED_VIDEO_JOB_MS = 8 * 60 * 1000

/**
 * Whether a video job has been stalled by the provider's queue.
 *
 * True when our job is still non-terminal, we have provider timestamps back,
 * and the provider has held the task at its `created_at` for longer than any
 * real render takes — meaning the queue accepted it but never started work.
 * Without this the workspace sat on the spinner for as long as BytePlus took to
 * time the task out itself, which is up to two days.
 *
 * A provider whose `updated_at` has moved past `created_at` is genuinely
 * rendering, however slowly, and is left alone — the queue picked the task up.
 */
export function isStalledVideoJob(
  job: { status?: string | null; started_at?: string | null; created_at?: string | null },
  provider: { status?: string; created_at?: number; updated_at?: number } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!job.status || !ACTIVE_JOB_STATUSES.includes(job.status)) return false
  if (!provider || provider.status === "succeeded" || provider.status === "failed" || provider.status === "cancelled") return false
  // Provider clocks are in seconds and both must be present to reason about
  // whether the queue has ever touched the task. Without them we cannot tell a
  // stall from a slow render, so we do not fail the job.
  if (typeof provider.created_at !== "number" || typeof provider.updated_at !== "number") return false
  // If BytePlus updated the task even once, the queue picked it up — slow is
  // not stalled, and the render is left to finish or fail on its own.
  if (provider.updated_at > provider.created_at) return false
  const clock = Date.parse(job.started_at || job.created_at || "")
  if (Number.isNaN(clock)) return false
  return now - clock >= STALLED_VIDEO_JOB_MS
}
