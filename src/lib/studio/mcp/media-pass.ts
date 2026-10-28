import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * A short-lived pass that lets the storyboard gallery load one account's media
 * through `/api/mcp/media`, which signs each file on request and redirects to it.
 *
 * It exists so a gallery result carries one short pass and storage paths
 * instead of a signed URL per file: hosts hand `structuredContent` to the model
 * as well as the view, and forty signed URLs are tens of kilobytes of it. The
 * result's `_meta` would have kept them from the model, but Claude's Code tab
 * does not pass `_meta` to the view.
 *
 * The pass is an HMAC over (user, expiry), keyed from the service role key, so
 * it needs no table and cannot be minted without the server's secret.
 */
export const MEDIA_PASS_SECONDS = 60 * 60

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("Supabase service role is not configured")
  return createHash("sha256").update(`creator-studio-media-pass:${secret}`).digest()
}

const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url")

export function createMediaPass(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Math.floor(now / 1000) + MEDIA_PASS_SECONDS })).toString("base64url")
  return `${payload}.${mac(payload)}`
}

/** The user a pass was issued to, or null when it is forged, malformed or expired. */
export function readMediaPass(pass: string, now = Date.now()) {
  const [payload, signature, extra] = pass.split(".")
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(mac(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: unknown; e?: unknown }
    if (typeof u !== "string" || !u || typeof e !== "number" || e * 1000 < now) return null
    return u
  } catch { return null }
}
