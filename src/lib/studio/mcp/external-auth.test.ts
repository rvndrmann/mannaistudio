import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ service: vi.fn(), client: vi.fn(), entitled: vi.fn(), features: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }))
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }))
vi.mock("@/lib/studio/entitlement", () => ({ hasCreatorStudioEntitlement: mocks.entitled }))
vi.mock("@/lib/studio/feature-flags", () => ({ fetchSiteFeatures: mocks.features }))
const request = () => new Request("https://studio.example/api/mcp", { headers: { authorization: "Bearer aih_alice-token" } })
let record: Record<string, unknown>
let connection: Record<string, unknown>
let acting: object
let verify: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example")
  record = { id: "token-id", user_id: "alice", scopes: ["projects:read"], revoked_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(), resource: "https://studio.example/api/mcp", mcp_connection_id: "connection-id" }
  connection = { user_id: "alice", scopes: ["projects:read"], revoked_at: null, resource: record.resource }
  acting = { marker: "alice-rls-client" }
  verify = vi.fn().mockResolvedValue({ error: null, data: { user: { id: "alice" }, session: { access_token: "alice-jwt", expires_at: Math.floor(Date.now() / 1000) + 3600 } } })
  const service = {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, update: () => q, maybeSingle: async () => ({ data: table === "creator_external_access_tokens" ? record : connection, error: null }) }
      return q
    },
    auth: { admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: { id: "alice", email: "alice@example.com" } }, error: null }),
      generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: "magic-hash" } }, error: null }),
    } },
  }
  mocks.service.mockReturnValue(service)
  mocks.client.mockImplementation((_url: unknown, _key: unknown, options: { global?: unknown }) => options.global ? acting : { auth: { verifyOtp: verify } })
  mocks.entitled.mockResolvedValue(true)
  mocks.features.mockResolvedValue({ mcp: true })
})
afterEach(() => vi.unstubAllEnvs())
describe("external tokens fail closed", () => {
  it("uses the verified owner's RLS client, never the service client", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    expect((await validateExternalRequest(request(), "projects:read"))?.supabase).toBe(acting)
  })
  it("refuses a failed or mismatched acting session", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    verify.mockResolvedValue({ error: new Error("Unavailable"), data: {} })
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    verify.mockResolvedValue({ error: null, data: { user: { id: "bob" }, session: { access_token: "bob-jwt" } } })
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
  })
  it("rejects expired/revoked tokens before creating any acting session", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    record.expires_at = new Date(Date.now() - 1000).toISOString()
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    expect(mocks.client).not.toHaveBeenCalled()
    record.expires_at = "invalid"
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    record.expires_at = null; record.revoked_at = new Date().toISOString()
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
  })
  it("checks revocation on every call even if the user session is cached", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    await validateExternalRequest(request())
    connection.revoked_at = new Date().toISOString()
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    expect(verify).toHaveBeenCalledTimes(1)
  })
  it("rejects identity mismatch, scope escalation and inactive subscriptions", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    connection.user_id = "bob"
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    connection.user_id = "alice"; record.scopes = ["admin:all"]
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 401 })
    record.scopes = ["projects:read"]
    await expect(validateExternalRequest(request(), "projects:write")).rejects.toMatchObject({ status: 403 })
    mocks.entitled.mockResolvedValue(false)
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 403 })
    mocks.entitled.mockResolvedValue(true); mocks.features.mockResolvedValue({ mcp: false })
    await expect(validateExternalRequest(request())).rejects.toMatchObject({ status: 403 })
  })
  it("allows hired-team access without granting Studio access", async () => {
    const { validateExternalRequest } = await import("@/lib/studio/external-auth")
    record.scopes = ["projects:read", "managed:read", "managed:messages"]
    connection.scopes = record.scopes
    mocks.entitled.mockResolvedValue(false)
    expect((await validateExternalRequest(request()))?.scopes).toEqual(["managed:read", "managed:messages"])
    expect((await validateExternalRequest(request(), "managed:read"))?.user.id).toBe("alice")
    await expect(validateExternalRequest(request(), "projects:read")).rejects.toMatchObject({ status: 403 })
  })
})
