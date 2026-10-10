import type { SupabaseClient } from "@supabase/supabase-js"
import { STALLED_SUBMISSION_MS } from "./stalled-jobs"

type SubmissionJob = {
  id: string
  type?: string
  provider?: string
  status: string
  provider_job_id?: string | null
  started_at?: string | null
  requested_at?: string | null
  approved_at?: string | null
  created_at?: string | null
}

// Recovery must have an end: renewing started_at forever hid submission failures.
export function submissionRecoveryExpired(job: SubmissionJob, now = Date.now()): boolean {
  if (job.provider_job_id) return false
  const approved = Date.parse(job.approved_at || job.created_at || "")
  return Number.isFinite(approved) && now - approved >= 2 * STALLED_SUBMISSION_MS
}

export function canClaimGeneration(job: SubmissionJob, now = Date.now()): boolean {
  if (job.provider_job_id) return false
  // An untouched approved image is queued, not an abandoned submission.
  if (job.type === "image" && job.status === "approved" && !job.started_at && !job.requested_at) return true
  if (submissionRecoveryExpired(job, now)) return false
  // Direct submissions already own their approved row while the POST runs.
  if (job.status === "approved" && !job.started_at && !job.requested_at) return true
  if (job.type !== "video" || !["approved", "generating", "processing"].includes(job.status)) return false
  const clock = Date.parse(job.started_at || job.requested_at || job.approved_at || job.created_at || "")
  return Number.isFinite(clock) && now - clock >= STALLED_SUBMISSION_MS
}

/** Both the background worker and poll must win this update before submitting. */
export async function claimGeneration(supabase: SupabaseClient, job: SubmissionJob, now = Date.now()): Promise<boolean> {
  if (!canClaimGeneration(job, now)) return false
  if (job.type === "image" && job.provider === "openai") {
    const { data, error } = await supabase.rpc("claim_openai_image_job", { p_job_id: job.id })
    if (error) throw error
    return data === true
  }
  const timestamp = new Date(now).toISOString()
  let query = supabase.from("creator_generation_jobs")
    .update({ status: "processing", started_at: timestamp })
    .eq("id", job.id)
    .eq("status", job.status)
    .is("provider_job_id", null)
  // Match the snapshot, including null clocks on old workers. A stale poll
  // cannot steal a renewed claim or overwrite a newly persisted provider id.
  query = job.started_at ? query.eq("started_at", job.started_at) : query.is("started_at", null)
  const { data, error } = await query.select("id").maybeSingle()
  if (error) throw error
  return Boolean(data)
}
