import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { hasCreatorStudioEntitlement } from "@/lib/studio/entitlement"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"
import { createExternalToken, hashExternalToken, tokenDisplayPrefix } from "@/lib/studio/external-auth"
import { consentCookie, digest, isManagedScope, McpOAuthError, mcpOrigin, mcpResource, parseScopes, pkceChallenge, registrationSchema, secret } from "./config"

export async function oauthRateLimit(request: Request, bucket: string, limit = 30) {
  const db = createServiceClient()
  // Configure your edge proxy to overwrite forwarding headers. Global budget
  // still bounds registration growth even if a client forges its IP header.
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100)
  for (const [key, budget] of [[`${bucket}:global`, 1000], [`${bucket}:${digest(ip)}`, limit]] as const) {
    const { data, error } = await db.rpc("creator_mcp_consume_rate_limit", { p_key: key, p_limit: budget })
    if (error) throw new McpOAuthError("server_error", "Connection service unavailable", 503)
    if (!data) throw new McpOAuthError("temporarily_unavailable", "Too many requests. Try again shortly.", 429)
  }
}
export async function registerClient(raw: unknown) {
  const parsed = registrationSchema.safeParse(raw)
  if (!parsed.success) throw new McpOAuthError("invalid_client_metadata", "Invalid MCP client registration")
  const body = parsed.data
  const id = `mcp_${secret()}`
  const { error } = await createServiceClient().from("creator_mcp_clients").insert({ id, name: body.client_name, redirect_uris: body.redirect_uris })
  if (error) throw new McpOAuthError("server_error", "Could not register client", 503)
  return { ...body, client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000) }
}
export async function beginAuthorization(params: URLSearchParams) {
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256") throw new McpOAuthError("invalid_request", "Authorization code with S256 PKCE is required")
  const challenge = params.get("code_challenge") || ""
  const state = params.get("state") || ""
  const clientId = params.get("client_id") || ""
  const redirect = params.get("redirect_uri") || ""
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 2048 || clientId.length > 200) throw new McpOAuthError("invalid_request", "Invalid authorization parameters")
  const resource = params.get("resource")
  if (resource !== mcpResource()) throw new McpOAuthError("invalid_target", "The requested resource does not match this Studio")
  const scopes = parseScopes(params.get("scope"))
  const db = createServiceClient()
  const { data: client, error } = await db.from("creator_mcp_clients").select("id,name,redirect_uris").eq("id", clientId).maybeSingle()
  // Do not redirect errors to any URI until it has been validated.
  if (error || !client || !client.redirect_uris.includes(redirect)) throw new McpOAuthError("invalid_request", "Unknown client or unregistered callback")
  const cookieSecret = secret()
  const { error: insertError } = await db.from("creator_mcp_requests").insert({
    secret_hash: digest(cookieSecret), client_id: client.id, redirect_uri: redirect,
    state, challenge, resource, scopes,
  })
  if (insertError) throw new McpOAuthError("server_error", "Could not start connection", 503)
  return cookieSecret
}
export async function pendingConsent() {
  const value = (await cookies()).get(consentCookie)?.value
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null
  const { data, error } = await createServiceClient().from("creator_mcp_requests")
    .select("id,client_id,redirect_uri,state,challenge,resource,scopes,expires_at")
    .eq("secret_hash", digest(value)).gt("expires_at", new Date().toISOString()).maybeSingle()
  if (error || !data || data.resource !== mcpResource()) return null
  const { data: client } = await createServiceClient().from("creator_mcp_clients").select("name").eq("id", data.client_id).maybeSingle()
  if (!client) return null
  return { ...data, clientName: client.name }
}
export async function decideConsent(id: string, approved: boolean, displayedUserId: string) {
  const pending = await pendingConsent()
  if (!pending || pending.id !== id) throw new McpOAuthError("invalid_request", "Connection request expired. Start again from your MCP client.")
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new McpOAuthError("access_denied", "Sign in to your Studio account first", 401)
  if (user.id !== displayedUserId) throw new McpOAuthError("access_denied", "Your signed-in account changed. Reload this page before connecting.", 403)
  const entitled = approved && await hasCreatorStudioEntitlement(supabase, user.id)
  const grantedScopes: string[] = entitled ? pending.scopes : pending.scopes.filter(isManagedScope)
  if (approved && !grantedScopes.length) throw new McpOAuthError("access_denied", "Creator Studio access is required for these permissions", 403)
  if (approved && !(await fetchSiteFeatures(supabase)).mcp) throw new McpOAuthError("access_denied", "Assistant connections are currently paused", 403)
  const db = createServiceClient()
  // Single-use browser consent; duplicate submissions cannot issue two grants.
  const { data: consumed, error: consumeError } = await db.from("creator_mcp_requests").delete()
    .eq("id", pending.id).gt("expires_at", new Date().toISOString()).select("id").maybeSingle()
  if (consumeError || !consumed) throw new McpOAuthError("invalid_request", "Connection request already used or expired")
  const callback = new URL(pending.redirect_uri)
  callback.searchParams.set("state", pending.state)
  callback.searchParams.set("iss", mcpOrigin())
  if (!approved) { callback.searchParams.set("error", "access_denied"); return callback }
  const { data: connection, error: connectionError } = await db.from("creator_mcp_connections").insert({
    user_id: user.id, client_id: pending.client_id, name: pending.clientName,
    scopes: grantedScopes, resource: pending.resource,
  }).select("id").single()
  if (connectionError || !connection) throw new McpOAuthError("server_error", "Could not connect account", 503)
  const code = secret()
  const { error: codeError } = await db.from("creator_mcp_codes").insert({
    code_hash: digest(code), connection_id: connection.id,
    redirect_uri: pending.redirect_uri, challenge: pending.challenge,
  })
  if (codeError) {
    await db.from("creator_mcp_connections").delete().eq("id", connection.id)
    throw new McpOAuthError("server_error", "Could not authorize account", 503)
  }
  callback.searchParams.set("code", code)
  return callback
}
export async function exchangeToken(body: URLSearchParams) {
  const grant = body.get("grant_type")
  if (grant !== "authorization_code" && grant !== "refresh_token") throw new McpOAuthError("unsupported_grant_type", "Unsupported token grant")
  const client = body.get("client_id") || ""
  const credential = body.get(grant === "authorization_code" ? "code" : "refresh_token") || ""
  const resource = body.get("resource") || ""
  const verifier = body.get("code_verifier") || ""
  if (!client || client.length > 200 || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw new McpOAuthError("invalid_grant", "Invalid credential")
  if (resource !== mcpResource()) throw new McpOAuthError("invalid_target", "Wrong Studio resource")
  if (grant === "authorization_code" && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new McpOAuthError("invalid_grant", "Invalid PKCE verifier")
  const access = createExternalToken()
  const refresh = secret()
  const { data, error } = await createServiceClient().rpc("creator_mcp_exchange", {
    p_grant: grant, p_hash: digest(credential), p_client: client, p_resource: resource,
    p_redirect: body.get("redirect_uri") || "", p_challenge: pkceChallenge(verifier),
    p_access_hash: hashExternalToken(access), p_access_prefix: tokenDisplayPrefix(access),
    p_refresh_hash: digest(refresh),
  })
  if (error || !data) throw new McpOAuthError("invalid_grant", "Credential expired, already used, revoked, or does not match this client")
  return { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: data.scope }
}
export async function revokeToken(body: URLSearchParams) {
  const token = body.get("token") || ""
  const client = body.get("client_id") || ""
  if (!token || !client) return
  const db = createServiceClient()
  let connectionId: string | undefined
  if (token.startsWith("aih_")) {
    const { data } = await db.from("creator_external_access_tokens").select("mcp_connection_id").eq("token_hash", hashExternalToken(token)).maybeSingle()
    connectionId = data?.mcp_connection_id
  } else {
    const { data } = await db.from("creator_mcp_connections").select("id").eq("refresh_hash", digest(token)).eq("client_id", client).maybeSingle()
    connectionId = data?.id
  }
  if (connectionId) {
    const { error } = await db.from("creator_mcp_connections").update({ revoked_at: new Date().toISOString(), refresh_hash: null })
      .eq("id", connectionId).eq("client_id", client)
    if (error) throw new McpOAuthError("server_error", "Could not revoke connection", 503)
  }
}
