import { afterEach, describe, expect, it, vi } from "vitest"
import { mcpOrigin, mcpResource, parseScopes, pkceChallenge, registrationSchema, requireSameOrigin, validRedirect } from "./config"
afterEach(() => vi.unstubAllEnvs())
describe("MCP authorization boundaries", () => {
  it("uses configured canonical URLs, never a caller's Host", () => {
    vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example.com")
    expect(mcpResource()).toBe("https://studio.example.com/api/mcp")
    expect(() => requireSameOrigin(new Request("https://attacker.example/api", { headers: { origin: "https://attacker.example" } }))).toThrow("Invalid request origin")
    expect(() => requireSameOrigin(new Request("https://studio.example.com/api"))).toThrow()
  })
  it("fails closed on missing configuration and insecure production origins", () => {
    vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "")
    expect(() => mcpOrigin()).toThrow()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "http://studio.example.com")
    expect(() => mcpOrigin()).toThrow()
    vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example.com/path")
    expect(() => mcpOrigin()).toThrow()
  })
  it("rejects unknown permissions and invalid callbacks", () => {
    expect(parseScopes("projects:read projects:read")).toEqual(["projects:read"])
    expect(() => parseScopes("admin:all")).toThrow()
    expect(() => parseScopes("")).toThrow()
    for (const url of ["javascript:alert(1)", "http://remote.example/callback", "https://user:pass@example.com", "https://example.com/#fragment", "//attacker.example"]) expect(validRedirect(url)).toBe(false)
    expect(validRedirect("http://127.0.0.1:4545/callback")).toBe(true)
    expect(validRedirect("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true)
    expect(registrationSchema.safeParse({ redirect_uris: ["https://chatgpt.com/callback"], token_endpoint_auth_method: "client_secret_basic" }).success).toBe(false)
  })
  it("matches the published RFC 7636 S256 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })
})
