/**
 * Where the browser may call an Edge Function from.
 *
 * Not "*": a user's access token is being sent. Shared rather than copied into
 * each function because the list is the kind of thing that gets a domain added
 * to one copy and not the other, and the copy that was missed is the one
 * someone finds on launch day.
 */
const allowedOrigins = new Set([
  "https://www.aidirectorhub.com",
  "https://aidirectorhub.com",
  "http://localhost:3000",
])

export function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://www.aidirectorhub.com"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}
