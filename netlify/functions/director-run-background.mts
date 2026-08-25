import type { Config, Context } from "@netlify/functions"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Runs one Director turn where no browser can end it.
 *
 * The turn itself is not reimplemented here. This calls the same chat route the
 * workspace calls, with streaming off, and simply holds the request until it
 * answers — which is the whole point: a background function is a caller that
 * cannot navigate away, reload, or be closed, and letting go of the request is
 * what was killing these runs.
 *
 * Netlify answers the dispatcher with 202 the moment this starts, so nothing
 * upstream waits on it either. The reply and the run are persisted by the route
 * as they always were, and the workspace picks them up over the Realtime
 * channel it already subscribes to.
 */

type Job = {
  projectId: string
  episodeId: string
  sessionId: string
  message: string
  model: string
  mentionedEntityIds: string[]
  /** The user's own token, so the turn runs with exactly their permissions. */
  accessToken: string
  issuedAt: number
}

const validForMs = 60 * 1000

function verify(raw: string, signature: string, secret: string): Job | null {
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8")
  const given = Buffer.from(signature, "utf8")
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const job = JSON.parse(raw) as Job
  if (typeof job?.issuedAt !== "number") return null
  if (Math.abs(Date.now() - job.issuedAt) > validForMs) return null
  return job
}

export default async (request: Request, _context: Context) => {
  const secret = process.env.DIRECTOR_BACKGROUND_SECRET
  if (!secret) {
    console.error("director-run-background: DIRECTOR_BACKGROUND_SECRET is not set")
    return
  }
  const raw = await request.text()
  const job = verify(raw, request.headers.get("x-director-signature") || "", secret)
  if (!job) {
    console.error("director-run-background: refused a job that did not verify")
    return
  }

  // The site's own origin. Netlify sets URL for the production site and
  // DEPLOY_URL for a deploy preview, so a preview's worker calls its own
  // deploy rather than reaching across into production.
  const origin = process.env.DEPLOY_URL || process.env.URL || new URL(request.url).origin
  const endpoint = `${origin}/api/studio/projects/${job.projectId}/director/chat`

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The turn runs as the user who asked for it, with their own row-level
        // permissions — a shared project behaves here exactly as it does in the
        // browser, because it is the same token doing the asking.
        Authorization: `Bearer ${job.accessToken}`,
        "x-director-background": "1",
      },
      body: JSON.stringify({
        episodeId: job.episodeId,
        sessionId: job.sessionId,
        message: job.message,
        model: job.model,
        mentionedEntityIds: job.mentionedEntityIds,
        stream: false,
        // Required by the route's schema, and a fresh one per attempt: this is
        // one turn being run once, not a retry of a turn already charged for.
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    if (!response.ok) {
      console.error("director-run-background: the chat route answered", response.status, (await response.text()).slice(0, 500))
      return
    }
    console.log("director-run-background: finished a turn for project", job.projectId, "in session", job.sessionId)
  } catch (error) {
    // Nothing to report to: the caller was answered with 202 long ago. The run
    // row carries the outcome, and the sweep closes it out if this died before
    // the route could write one.
    console.error("director-run-background: the turn did not finish", error)
  }
}

export const config: Config = {
  background: true,
  path: "/api/internal/director-run",
}
