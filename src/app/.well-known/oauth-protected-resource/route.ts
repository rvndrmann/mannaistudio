import { mcpOrigin, mcpResource, mcpScopes } from "@/lib/studio/mcp/config"
export const dynamic = "force-dynamic"
export async function GET() {
  return Response.json({ resource: mcpResource(), authorization_servers: [mcpOrigin()], scopes_supported: mcpScopes, bearer_methods_supported: ["header"] })
}
