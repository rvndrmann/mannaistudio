import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ service: vi.fn(), browser: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.browser }))
import { DELETE, GET } from "@/app/api/studio/external/connections/route"
const aliceId = "11111111-1111-4111-8111-111111111111"
const bobId = "22222222-2222-4222-8222-222222222222"
let rows: { id: string; user_id: string; revoked_at: string | null }[]
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example")
  rows = [{ id: aliceId, user_id: "alice", revoked_at: null }, { id: bobId, user_id: "bob", revoked_at: null }]
  mocks.browser.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "alice" } }, error: null }) } })
  mocks.service.mockReturnValue({ from: () => {
    const filters: Record<string, unknown> = {}
    let patch: Record<string, unknown> | undefined
    const match = () => rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value))
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q }, is: (key: string, value: unknown) => { filters[key] = value; return q },
      update: (value: Record<string, unknown>) => { patch = value; return q },
      order: async () => ({ data: match(), error: null }),
      maybeSingle: async () => { const row = match()[0]; if (row && patch) Object.assign(row, patch); return { data: row || null, error: null } },
    }
    return q
  } })
})
afterEach(() => vi.unstubAllEnvs())
function disconnect(id: string, origin = "https://studio.example") {
  return DELETE(new NextRequest("https://studio.example/api/studio/external/connections", { method: "DELETE", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ id }) }))
}
describe("connection management isolation", () => {
  it("lists only the current user's connections", async () => {
    const response = await GET()
    const data = await response.json()
    expect(data.connections.map((row: { id: string }) => row.id)).toEqual([aliceId])
  })
  it("cannot revoke another user's connection even with its UUID", async () => {
    expect((await disconnect(bobId)).status).toBe(404)
    expect(rows[1].revoked_at).toBeNull()
    expect((await disconnect(aliceId)).status).toBe(200)
    expect(rows[0].revoked_at).toBeTruthy()
  })
  it("rejects forged origin and signed-out requests", async () => {
    expect((await disconnect(aliceId, "https://attacker.example")).status).toBe(403)
    expect(rows[0].revoked_at).toBeNull()
    mocks.browser.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })
    expect((await GET()).status).toBe(401)
  })
})
