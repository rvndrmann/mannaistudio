import { generationProvider, isVideoGenerationModel } from "./generation-models"

export const VIDEO_WORKER_PATH = "/.netlify/functions/submit-video-background"

/**
 * Whether a clip's submission is too slow to finish inside a request.
 *
 * Only BytePlus: it wants every new face registered first, at three a minute,
 * so a shot with several new references needs longer than the host allows. The
 * other providers take one call and answer in seconds, and keeping them in the
 * request keeps their errors immediate.
 */
export function submitsOnVideoWorker(model: unknown, origin: string) {
  if (typeof model !== "string" || !isVideoGenerationModel(model) || generationProvider(model) !== "byteplus") return false
  // There is no worker beside a local dev server, and no limit to escape.
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
}

/**
 * Hands an accepted job to the background worker.
 *
 * True only on the worker's own 202. Anything else — the function missing from
 * this deploy, a timeout, a page answering in its place — is a refusal, and the
 * caller submits in the request as it always did. The job's claim keeps the two
 * from both submitting when a hand-off landed but its answer was lost.
 */
export async function handOffVideoSubmission(input: { origin: string; accessToken: string; projectId: string; jobId: string; request: unknown }): Promise<boolean> {
  try {
    const response = await fetch(`${input.origin}${VIDEO_WORKER_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: input.projectId, jobId: input.jobId, request: input.request }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    return response.status === 202
  } catch {
    return false
  }
}
