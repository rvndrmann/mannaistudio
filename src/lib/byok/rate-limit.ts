import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { recordCredentialEvent } from "./credential-service"

/**
 * Rate limit on the credential endpoints.
 *
 * These are the endpoints worth hammering: each save and test spends a call
 * against the provider, and an unbounded test endpoint is a way to check stolen
 * keys through someone else's server. Limiting by user and by address means
 * neither a compromised session nor a spread of sessions from one place gets a
 * free run.
 *
 * In-process counters, which is honest about what they are: a single Netlify
 * instance's view. They stop the accidental loop and the casual abuser. If
 * credential endpoints ever need to hold against a distributed attempt, this is
 * the piece to move into Postgres — the interface stays the same.
 */

const WINDOW_MS = 60_000
const PER_USER = 10
const PER_ADDRESS = 30

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function take(key: string, limit: number, now: number): boolean {
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (existing.count >= limit) return false
  existing.count += 1
  return true
}

/** Drops expired buckets so a long-lived instance does not grow a map forever. */
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, bucket] of Array.from(buckets.entries())) if (bucket.resetAt <= now) buckets.delete(key)
}

function addressOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || "unknown"
}

/**
 * Returns a 429 response when the caller has had enough, or null to continue.
 */
export async function consumeCredentialRateLimit(userId: string, request: NextRequest): Promise<NextResponse | null> {
  const now = Date.now()
  sweep(now)
  const address = addressOf(request)
  const allowed = take(`user:${userId}`, PER_USER, now) && take(`addr:${address}`, PER_ADDRESS, now)
  if (allowed) return null

  await recordCredentialEvent({
    userId,
    event: "suspicious_credential_activity",
    detail: { reason: "rate_limited", endpoint: new URL(request.url).pathname },
  })
  return NextResponse.json(
    { error: "Too many credential requests. Wait a minute and try again." },
    { status: 429, headers: { "retry-after": "60" } },
  )
}
