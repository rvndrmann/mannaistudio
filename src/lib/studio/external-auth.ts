import { createHash, randomBytes } from "crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { AuthenticatedProjectContext } from "./server-context"
import { StudioAccessError } from "./server-context"

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

export async function validateExternalRequest(request: Request, requiredScope: string) {
  const token = bearerToken(request)
  if (!token) return null
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
  return { supabase, user: user.user }
}

export async function requireProjectFromRequest(
  request: Request,
  projectId: string,
  requiredScope: string,
): Promise<AuthenticatedProjectContext> {
  const external = await validateExternalRequest(request, requiredScope)
  if (external) return requireProjectForUser(external.supabase, external.user, projectId)

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

  if (error) throw new StudioAccessError("Could not verify project access", 403)
  if (!project) throw new StudioAccessError("Project not found", 404)

  return { supabase, user, project }
}
