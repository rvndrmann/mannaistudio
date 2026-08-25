/**
 * Where to send someone once they have signed in.
 *
 * A shared link is the whole point: send somebody `/courses/abc` and they
 * should land on `/courses/abc`, not on the home page having lost the thing
 * they were sent. The OAuth callback has always accepted a `next` parameter —
 * nothing ever set it, so every sign-in fell back to `/`.
 *
 * Now that it is set from the browser it is also attacker-reachable, because a
 * link to our own sign-in can carry any `next` someone likes and the callback
 * redirects to it. So this is an allowlist of shape rather than a blocklist:
 * a path on this site, and nothing else.
 */

/** Paths that must never be returned to, because they are the sign-in itself. */
const authPaths = ["/auth", "/login"]

export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  // Must be a path on this site. A value carrying its own scheme or authority
  // is a different origin however it is spelled.
  if (!value.startsWith("/")) return false
  // "//evil.com" and "/\evil.com" are protocol-relative URLs, not paths. They
  // are the usual way an open redirect is smuggled past a startsWith("/") check.
  if (value.startsWith("//") || value.startsWith("/\\")) return false
  // A backslash is normalised to a forward slash by some URL parsers but not
  // others, which is exactly the disagreement these bugs live in.
  if (value.includes("\\")) return false
  // Control characters, newlines and tabs are stripped by browsers before the
  // URL is parsed, so "/<tab>javascript:..." is not the string it appears to be.
  if (/[\u0000-\u001F\u007F]/.test(value)) return false
  return true
}

/**
 * The path to return to, or the fallback.
 *
 * Returning to the sign-in page after signing in is a loop, so those paths fall
 * back too — a user who pressed sign-in from `/login` wants the site, not the
 * page they just left.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (!isSafeNextPath(value)) return fallback
  const path = value.split(/[?#]/)[0]
  if (authPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return fallback
  return value
}
