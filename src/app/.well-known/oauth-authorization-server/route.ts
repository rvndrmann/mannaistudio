import { mcpOrigin, mcpScopes } from "@/lib/studio/mcp/config"
export const dynamic = "force-dynamic"
export async function GET() {
  const origin = mcpOrigin()
  return Response.json({
    issuer: origin, authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`, registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: mcpScopes,
    authorization_response_iss_parameter_supported: true,
  })
}
