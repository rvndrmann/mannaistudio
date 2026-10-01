import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pkceChallenge, secret } from "./config"
const mocks = vi.hoisted(() => ({ service: vi.fn(), browser: vi.fn(), cookies: vi.fn(), entitled: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.browser }))
vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("@/lib/studio/entitlement", () => ({ hasCreatorStudioEntitlement: mocks.entitled }))
vi.mock("@/lib/studio/feature-flags", () => ({ fetchSiteFeatures: vi.fn().mockResolvedValue({ mcp: true }) }))
import { beginAuthorization, decideConsent, exchangeToken, pendingConsent } from "./oauth"
let inserts: { table: string; data: Record<string, unknown> }[]
let storedRequest: Record<string, unknown> | null
let browserUser: { id: string } | null
let replay: boolean
const id = "11111111-1111-4111-8111-111111111111"
function params() {
  return new URLSearchParams({ client_id: "client-a", redirect_uri: "https://client.example/callback", resource: "https://studio.example/api/mcp", state: "state-123", response_type: "code", code_challenge_method: "S256", code_challenge: pkceChallenge("a".repeat(43)), scope: "projects:read director:chat" })
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example")
  inserts = []; replay = false; browserUser = { id: "alice" }
  storedRequest = { id, client_id: "client-a", redirect_uri: "https://client.example/callback", resource: "https://studio.example/api/mcp", state: "state-123", scopes: ["projects:read"], challenge: pkceChallenge("a".repeat(43)) }
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "b".repeat(43) }) })
  mocks.entitled.mockResolvedValue(true)
  mocks.browser.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: browserUser }, error: null }) } })
  mocks.service.mockReturnValue({
    from: (table: string) => {
      let op = "select"
      const q = {
        select: () => q, eq: () => q, gt: () => q,
        delete: () => { op = "delete"; return q },
        insert: (data: Record<string, unknown>) => { op = "insert"; inserts.push({ table, data }); return q },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        maybeSingle: async () => {
          if (table === "creator_mcp_clients") return { data: { id: "client-a", name: "Assistant", redirect_uris: ["https://client.example/callback"] }, error: null }
          if (op === "delete") { const wasReplay = replay; replay = true; return { data: wasReplay ? null : { id }, error: null } }
          return { data: storedRequest, error: null }
        },
        single: async () => ({ data: { id: "connection-alice" }, error: null }),
      }
      return q
    },
    rpc: vi.fn().mockResolvedValue({ data: { scope: "projects:read" }, error: null }),
  })
})
afterEach(() => vi.unstubAllEnvs())
describe("browser OAuth account consent", () => {
  it("requires registered exact callback, audience, and S256", async () => {
    const query = params(); query.set("redirect_uri", "https://attacker.example/callback")
    await expect(beginAuthorization(query)).rejects.toThrow("unregistered callback")
    query.set("redirect_uri", "https://client.example/callback"); query.set("resource", "https://attacker.example")
    await expect(beginAuthorization(query)).rejects.toThrow("resource")
    query.set("resource", "https://studio.example/api/mcp"); query.set("code_challenge_method", "plain")
    await expect(beginAuthorization(query)).rejects.toThrow("S256")
    expect(inserts).toHaveLength(0)
  })
  it("persists only a hash of the browser transaction secret", async () => {
    const cookie = await beginAuthorization(params())
    expect(cookie).toHaveLength(43)
    expect(JSON.stringify(inserts)).not.toContain(cookie)
    expect(inserts[0].data.scopes).toEqual(["projects:read", "director:chat"])
  })
  it("cannot approve without the browser transaction, matching form or signed-in account", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined })
    expect(await pendingConsent()).toBeNull()
    await expect(decideConsent(id, true, "alice")).rejects.toThrow("expired")
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "b".repeat(43) }) })
    await expect(decideConsent("another-request", true, "alice")).rejects.toThrow("expired")
    browserUser = null
    await expect(decideConsent(id, true, "alice")).rejects.toThrow("Sign in")
    browserUser = { id: "bob" }
    await expect(decideConsent(id, true, "alice")).rejects.toThrow("account changed")
    expect(inserts).toHaveLength(0)
  })
  it("denial returns state and issuer without issuing credentials", async () => {
    const callback = await decideConsent(id, false, "alice")
    expect(callback.searchParams.get("error")).toBe("access_denied")
    expect(callback.searchParams.get("state")).toBe("state-123")
    expect(callback.searchParams.get("iss")).toBe("https://studio.example")
    expect(inserts).toHaveLength(0)
  })
  it("grants only the current user and requested permissions, once", async () => {
    const callback = await decideConsent(id, true, "alice")
    expect(inserts[0].data.user_id).toBe("alice")
    expect(inserts[0].data.scopes).toEqual(["projects:read"])
    const code = callback.searchParams.get("code")
    expect(code).toHaveLength(43)
    expect(JSON.stringify(inserts)).not.toContain(code)
    await expect(decideConsent(id, true, "alice")).rejects.toThrow("already used")
  })
  it("does not send the raw code, access token, or refresh token to the database", async () => {
    const code = secret()
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: "client-a", code, code_verifier: "a".repeat(43), redirect_uri: "https://client.example/callback", resource: "https://studio.example/api/mcp" })
    const tokens = await exchangeToken(body)
    const rpc = mocks.service().rpc
    const serialized = JSON.stringify(rpc.mock.calls)
    expect(serialized).not.toContain(code)
    expect(serialized).not.toContain(tokens.access_token)
    expect(serialized).not.toContain(tokens.refresh_token)
    expect(tokens.expires_in).toBe(3600)
  })
  it("grants only managed permissions to a customer without a Studio subscription", async () => {
    storedRequest!.scopes = ["projects:read", "director:chat", "managed:read", "managed:messages"]
    mocks.entitled.mockResolvedValue(false)
    await decideConsent(id, true, "alice")
    expect(inserts[0].data.scopes).toEqual(["managed:read", "managed:messages"])
  })
})
