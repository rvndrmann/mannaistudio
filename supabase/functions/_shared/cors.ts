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

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  if (allowedOrigins.has(origin)) return true
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true
  if (/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(origin)) return true
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)) return true
  return false
}

export function corsHeaders(origin: string | null) {
  const allowed = isAllowedOrigin(origin) ? origin! : "https://www.aidirectorhub.com"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-auth-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}
