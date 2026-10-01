import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { bearerToken, validateExternalRequest } from "@/lib/studio/external-auth"
import { studioErrorStatus } from "@/lib/studio/server-context"
import { mcpOrigin, mcpResource } from "@/lib/studio/mcp/config"
import { createAccountMcpServer } from "@/lib/studio/mcp/server"
import { enforceStudioRateLimit } from "@/lib/studio/rate-limit"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(request: Request) {
  const origin = mcpOrigin()
  const headers = { "Cache-Control": "no-store", "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` }
  // Native clients often omit Origin. A supplied Origin must be this site;
  // browser-based third-party clients require a deliberate allowlist change.
  if (request.headers.has("origin") && request.headers.get("origin") !== origin) return Response.json({ error: "Invalid origin" }, { status: 403 })
  try {
    // No cookie fallback: a hosted client must present its own OAuth bearer.
    const account = await validateExternalRequest(request)
    if (!account || !account.connectionId || account.resource !== mcpResource()) return Response.json({ error: "Connect your Creator Studio account" }, { status: 401, headers })
    await enforceStudioRateLimit(account.supabase, "mcp_requests", 120, 60, account.user.id)
    const server = createAccountMcpServer(bearerToken(request), account.scopes)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65_536 })
    try {
      await server.connect(transport)
      // JSON mode completes tool execution before returning; no shared sessions
      // or long-lived SSE streams survive across users or serverless instances.
      const response = await transport.handleRequest(request)
      response.headers.set("Cache-Control", "no-store")
      return response
    } finally { await server.close() }
  } catch (error) {
    const status = studioErrorStatus(error)
    return Response.json({ error: status < 500 && error instanceof Error ? error.message : "Creator Studio connection unavailable" }, { status, headers })
  }
}
export const POST = handle
export const GET = handle
export const DELETE = handle
