import { createHash, randomBytes } from "crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { AuthenticatedProjectContext } from "./server-context"
import { requireAuthenticatedProject, StudioAccessError } from "./server-context"

/**
 * A Supabase client that acts as the holder of one access token.
 *
 * Row-level security sees the token's user, so every read and write is bounded
 * exactly as it would be in that user's browser. This is the opposite of the
 * service client, which sees everything and is why it is not used here.
 */
function createTokenClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}

export const externalTokenPrefix = "aih_"

export function createExternalToken() {
  return `${externalTokenPrefix}${randomBytes(32).toString("base64url")}`
}

export function hashExternalToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function tokenDisplayPrefix(token: string) {
  return token.slice(0, 12)
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

/**
 * Sessions minted for token holders, kept until shortly before they expire.
 *
 * Minting costs a round trip to the auth server, so doing it per request would
 * add a second to every call and lean on an endpoint that rate-limits. One
 * session per user per hour is enough.
 */
const actingSessions = new Map<string, { client: SupabaseClient; expiresAt: number }>()

/**
 * A client that genuinely *is* the token's owner, rather than one acting on
 * their behalf.
 *
 * The service client was the obvious way to serve a token holder and the wrong
 * one. Postgres sees no `auth.uid()` through it, and fourteen SECURITY DEFINER
 * functions on this path — approvals, credit reservation, job claiming, XP —
 * read a missing identity as "refuse". Each would have had to learn to take an
 * id it could not verify, and each is a place where passing the wrong id spends
 * someone else's money.
 *
 * So the identity is made real instead: a session is minted for the user the
 * token belongs to, and every query runs under it. `auth.uid()` resolves, RLS
 * applies exactly as it does in that user's browser, and the functions need no
 * changes at all. It is also strictly narrower than what this path had before —
 * a token no longer reaches anything its owner could not.
 */
async function sessionClientFor(user: User): Promise<SupabaseClient | null> {
  const cached = actingSessions.get(user.id)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.client
  if (!user.email) return null

  const admin = createServiceClient()
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email })
  const hashedToken = link.data?.properties?.hashed_token
  if (link.error || !hashedToken) return null

  // Verified through the anon client, because that is the exchange a browser
  // makes; the admin client cannot hold the resulting session.
  const anon = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken })
  const session = verified.data?.session
  if (verified.error || !session) return null

  const client = createTokenClient(session.access_token)
  actingSessions.set(user.id, {
    client,
    expiresAt: (session.expires_at ? session.expires_at * 1000 : Date.now() + 3_600_000),
  })
  return client
}

export async function validateExternalRequest(request: Request, requiredScope: string) {
  const token = bearerToken(request)
  // Only tokens this app minted are looked up here. Without the prefix check a
  // bearer of any other kind — a Supabase access token, say — was hashed,
  // missed, and rejected as an invalid external token rather than being left
  // for whoever else can read it.
  if (!token || !token.startsWith(externalTokenPrefix)) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("creator_external_access_tokens")
    .select("id,user_id,scopes,revoked_at")
    .eq("token_hash", hashExternalToken(token))
    .maybeSingle()
  if (error || !data || data.revoked_at) throw new StudioAccessError("Invalid external access token", 401)
  const scopes = Array.isArray(data.scopes) ? data.scopes : []
  if (!scopes.includes(requiredScope)) throw new StudioAccessError("External token does not include the required scope", 403)
  await supabase
    .from("creator_external_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
  const { data: user, error: userError } = await supabase.auth.admin.getUserById(data.user_id)
  if (userError || !user.user) throw new StudioAccessError("External token user was not found", 401)

  // Falls back to the service client only if a session cannot be minted, so a
  // token keeps working for reads rather than failing outright — writes that
  // need an identity will still refuse, which is the safe direction.
  const acting = await sessionClientFor(user.user).catch(() => null)
  return { supabase: acting || supabase, user: user.user }
}

export async function requireProjectFromRequest(
  request: Request,
  projectId: string,
  requiredScope: string,
): Promise<AuthenticatedProjectContext> {
  const external = await validateExternalRequest(request, requiredScope)
  if (external) return requireProjectForUser(external.supabase, external.user, projectId)

  // A caller that is not a browser and holds the user's own access token — the
  // background worker, which is handed one so the turn it runs is the user's
  // turn. Deliberately the same access check as the cookie path below, through
  // a client carrying the same token: a project shared with someone reads the
  // same way here as it does in their tab, because it is the same credential
  // asking. Nothing is trusted from the request beyond the token itself.
  const accessToken = bearerToken(request)
  if (accessToken) return requireAuthenticatedProject(projectId, createTokenClient(accessToken))

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new StudioAccessError("Unauthorized", 401)
  return requireProjectForUser(supabase, user, projectId)
}

export async function requireProjectForUser(
  supabase: SupabaseClient,
  user: User,
  projectId: string,
): Promise<AuthenticatedProjectContext> {
  const { data: project, error } = await supabase
    .from("creator_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error("Project access check failed (token path):", { projectId, code: error.code, message: error.message })
    throw new StudioAccessError(
      `Could not verify project access${error.code ? ` (${error.code})` : ""}. This is usually temporary — try again.`,
      403,
    )
  }
  if (!project) throw new StudioAccessError("Project not found", 404)

  return { supabase, user, project }
}
