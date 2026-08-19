/**
 * Numbering the images a shot can be given.
 *
 * A shot accumulates generations — image history is additive, so the third
 * attempt does not replace the second. In conversation people pick between
 * them by position: "use the first one", "go back to the second image for shot
 * 7". Nothing carried that position. The job list came back newest-first
 * across the whole project, identified by uuid, so the Director had to count
 * backwards through unrelated jobs and hope.
 *
 * So each job that produced something is numbered per shot and per kind,
 * oldest first, which is the order they appear in the storyboard gallery. A
 * job with no result — failed, or still running — is not a candidate and is
 * left unnumbered rather than shifting the numbers of the ones that are.
 */

export type CandidateJob = {
  id: string
  shot_id?: string | null
  type?: string | null
  result_url?: string | null
}

export type NumberedJob<T extends CandidateJob> = T & {
  shotNumber: number | null
  candidate: number | null
}

export function withCandidateNumbers<T extends CandidateJob>(
  jobs: T[],
  shotNumberById: Map<string, number>,
): NumberedJob<T>[] {
  // Oldest first, so candidate 1 is the first image the shot was given. The
  // caller's list is newest-first for reading, and that order is preserved on
  // the way out — only the numbering runs chronologically.
  const chronological = jobs.map((job, index) => ({ job, index })).reverse()
  const seen = new Map<string, number>()
  const numbers = new Map<string, number>()

  for (const { job } of chronological) {
    if (!job.result_url || !job.shot_id) continue
    const bucket = `${job.shot_id}:${job.type || "image"}`
    const next = (seen.get(bucket) || 0) + 1
    seen.set(bucket, next)
    numbers.set(job.id, next)
  }

  return jobs.map((job) => ({
    ...job,
    shotNumber: job.shot_id ? shotNumberById.get(job.shot_id) ?? null : null,
    candidate: numbers.get(job.id) ?? null,
  }))
}
