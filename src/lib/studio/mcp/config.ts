import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"

export const mcpScopes = ["projects:read", "projects:write", "director:chat", "director:proposals", "managed:read", "managed:messages"] as const
export const isManagedScope = (scope: string) => scope === "managed:read" || scope === "managed:messages"
export const consentCookie = "creator_mcp_consent"
export const scopeLabels: Record<string, string> = {
  "projects:read": "View your own projects, storyboards, and generation results",
  "projects:write": "Create projects in your account",
  "director:chat": "Talk to your AI Director and request creative work (uses your account's credits)",
  "director:proposals": "Approve or reject generation proposals (approval can spend your credits)",
  "managed:read": "View your hired-team orders, progress, delivery dates, and published final files",
  "managed:messages": "Send messages to the creative team on your own orders",
}
export class McpOAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
export function mcpOrigin() {
  const raw = process.env.STUDIO_MCP_PUBLIC_URL
  if (!raw) throw new McpOAuthError("server_error", "STUDIO_MCP_PUBLIC_URL is not configured", 503)
  const url = new URL(raw)
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("STUDIO_MCP_PUBLIC_URL must be an origin")
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("MCP requires a public HTTPS origin")
  return url.origin
}
export const mcpResource = () => `${mcpOrigin()}/api/mcp`
export const secret = () => randomBytes(32).toString("base64url")
export const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url")
export function parseScopes(value: string | null) {
  const requested = value === null ? [...mcpScopes] : Array.from(new Set(value.split(/\s+/).filter(Boolean)))
  if (!requested.length || requested.some((scope) => !mcpScopes.includes(scope as typeof mcpScopes[number]))) throw new McpOAuthError("invalid_scope", "Unsupported permissions")
  return requested
}
export function validRedirect(value: string) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash || value.length > 2048) return false
    if (url.protocol === "https:") return true
    return url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
  } catch { return false }
}
export const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(120).default("MCP client"),
  redirect_uris: z.array(z.string().refine(validRedirect, "Use HTTPS or a loopback callback")).min(1).max(10),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
})
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== mcpOrigin()) throw new McpOAuthError("invalid_request", "Invalid request origin", 403)
}
