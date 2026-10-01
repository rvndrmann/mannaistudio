import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { consentCookie, McpOAuthError, mcpOrigin, requireSameOrigin } from "@/lib/studio/mcp/config"
import { beginAuthorization, decideConsent, exchangeToken, oauthRateLimit, registerClient, revokeToken } from "@/lib/studio/mcp/oauth"
import { boundedBody } from "@/lib/studio/mcp/request-body"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" }
function failure(error: unknown) {
  if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ error: "invalid_request", error_description: "Invalid connection request" }, { status: 400, headers: noStore })
  const known = error instanceof McpOAuthError
  if (!known) console.error("MCP OAuth request failed", error instanceof Error ? error.message : "Unknown error")
  return NextResponse.json({ error: known ? error.code : "server_error", error_description: known ? error.message : "Could not process connection request" }, { status: known ? error.status : 503, headers: noStore })
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    if ((await params).action !== "authorize") return new Response(null, { status: 404 })
    await oauthRateLimit(request, "authorize")
    const value = await beginAuthorization(request.nextUrl.searchParams)
    const response = NextResponse.redirect(`${mcpOrigin()}/connect/creator-studio`, { status: 303, headers: noStore })
    response.cookies.set(consentCookie, value, { httpOnly: true, secure: mcpOrigin().startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600 })
    return response
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params
    if (!["register", "token", "consent", "revoke"].includes(action)) return new Response(null, { status: 404 })
    if (action === "consent") requireSameOrigin(request)
    await oauthRateLimit(request, action, action === "register" ? 10 : 30)
    // Bound parsing for unauthenticated registration and token endpoints.
    const raw = await boundedBody(request)
    if (action === "register") {
      if (!request.headers.get("content-type")?.includes("application/json")) throw new McpOAuthError("invalid_request", "JSON required")
      return NextResponse.json(await registerClient(JSON.parse(raw)), { status: 201, headers: noStore })
    }
    if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) throw new McpOAuthError("invalid_request", "Form encoding required")
    const body = new URLSearchParams(raw)
    if (action === "token") return NextResponse.json(await exchangeToken(body), { headers: noStore })
    if (action === "revoke") { await revokeToken(body); return new Response(null, { status: 200, headers: noStore }) }
    const id = z.string().uuid().parse(body.get("requestId"))
    const decision = z.enum(["approve", "deny"]).parse(body.get("decision"))
    const displayedUserId = z.string().uuid().parse(body.get("accountId"))
    const callback = await decideConsent(id, decision === "approve", displayedUserId)
    const response = NextResponse.redirect(callback, { status: 303, headers: { ...noStore, "Referrer-Policy": "no-referrer" } })
    response.cookies.delete(consentCookie)
    return response
  } catch (error) { return failure(error) }
}
