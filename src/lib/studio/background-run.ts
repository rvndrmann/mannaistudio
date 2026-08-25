import { createHmac, timingSafeEqual } from "crypto"
import type { AutopilotMode } from "./autopilot"

/**
 * Running a Director turn where no browser can interrupt it.
 *
 * A turn executes inside the request that streams it, so the run is only alive
 * while the tab holding that stream is. The run data says what that costs:
 * runs die a median of twenty-three seconds in, with tool steps already done,
 * while others finish happily at nearly three hundred — early and scattered, the
 * shape of something being let go of rather than something running out of time.
 *
 * A background worker has no reader to lose. The turn is handed to it, the
 * browser is told which run to watch, and the workspace follows the same
 * Realtime channel it already subscribes to. Closing the tab stops mattering.
 *
 * The cost is the live text: a worker cannot stream tokens back to a request
 * that has already been answered. So this is deliberately not for every turn —
 * see `shouldRunInBackground`.
 */

/** The env var that turns the worker on. Absent means nothing changes. */
export const backgroundRunSecretEnv = "DIRECTOR_BACKGROUND_SECRET"

export type BackgroundRunDecision = {
  background: boolean
  /** Why, for the log line and for the tests to read. */
  reason: string
}

/**
 * Whether this turn should be handed to the worker instead of streamed.
 *
 * Only autopilot turns, and only when the worker is configured. Both halves
 * matter:
 *
 * The configuration check is what makes this change inert until someone deploys
 * the worker and sets its secret. Nothing about an existing install behaves
 * differently until then.
 *
 * The autopilot check is where the trade sits. A person who typed a message is
 * watching the reply arrive and would notice the text stop appearing; an
 * autopilot turn is one the workspace pressed on its own, and the Director is
 * already told "no one is reading your reply as it lands". Giving up live text
 * costs that turn nothing and buys it a run that survives a closed tab.
 */
export function shouldRunInBackground(input: {
  mode: AutopilotMode
  /** The turn came from the autopilot loop rather than from the composer. */
  automated: boolean
  secret?: string | undefined
}): BackgroundRunDecision {
  if (!input.secret) return { background: false, reason: "worker-not-configured" }
  if (input.mode === "manual") return { background: false, reason: "manual-mode" }
  if (!input.automated) return { background: false, reason: "user-typed-turn" }
  return { background: true, reason: `autopilot:${input.mode}` }
}

/**
 * The job as it travels to the worker.
 *
 * It carries the user's own access token rather than a user id, and that is the
 * whole access story: the worker authenticates as the user, row-level security
 * bounds the turn exactly as it would in their browser, and a project shared
 * with somebody behaves the same here as it does there. Nothing in the job
 * grants anything — the token does, and the token is theirs.
 *
 * Signed because it crosses the network, and short-lived because it carries a
 * credential.
 */
export type BackgroundRunJob = {
  projectId: string
  episodeId: string
  sessionId: string
  message: string
  model: string
  mentionedEntityIds: string[]
  accessToken: string
  issuedAt: number
}

/** How long a signed job stays acceptable, so a captured one cannot be replayed later. */
export const backgroundJobValidForMs = 60 * 1000

export function signBackgroundJob(job: BackgroundRunJob, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(job)).digest("hex")
}

/**
 * The job a signature vouches for, or null.
 *
 * Compared in constant time, and only after the shapes match: the worker is
 * reachable over the network, so it treats its input as something an attacker
 * wrote until the signature says otherwise.
 */
export function verifyBackgroundJob(
  body: unknown,
  signature: string | null | undefined,
  secret: string,
  now = Date.now(),
): BackgroundRunJob | null {
  if (!signature || !secret) return null
  if (!body || typeof body !== "object") return null
  const job = body as BackgroundRunJob
  const wellFormed = typeof job.projectId === "string"
    && typeof job.episodeId === "string"
    && typeof job.sessionId === "string"
    && typeof job.accessToken === "string"
    && typeof job.message === "string"
    && typeof job.model === "string"
    && Array.isArray(job.mentionedEntityIds)
    && typeof job.issuedAt === "number"
  if (!wellFormed) return null
  if (job.issuedAt > now + backgroundJobValidForMs) return null
  if (job.issuedAt < now - backgroundJobValidForMs) return null
  const expected = Buffer.from(signBackgroundJob(job, secret), "utf8")
  const given = Buffer.from(signature, "utf8")
  if (expected.length !== given.length) return null
  return timingSafeEqual(expected, given) ? job : null
}


/**
 * The worker's own path, served by netlify/functions/director-run-background.
 * Netlify answers it with 202 as soon as the function starts.
 */
export const backgroundRunPath = "/api/internal/director-run"

/**
 * Hands the turn to the worker, and says whether it was taken.
 *
 * False is not an error to report to the user: the caller runs the turn itself
 * instead, which is what it did before this existed. A worker that is missing,
 * misconfigured, or slow to answer therefore costs a turn nothing.
 */
export async function dispatchBackgroundRun(input: {
  origin: string
  secret: string
  job: BackgroundRunJob
}): Promise<boolean> {
  const raw = JSON.stringify(input.job)
  try {
    const response = await fetch(`${input.origin}${backgroundRunPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-director-signature": signBackgroundJob(input.job, input.secret),
      },
      body: raw,
      signal: AbortSignal.timeout(5_000),
    })
    // 202 is the platform acknowledging that the background function started.
    // Anything else means the turn was not taken and has to run here.
    return response.status === 202
  } catch (error) {
    console.warn("Could not hand this turn to the background worker; running it here instead.", error)
    return false
  }
}
