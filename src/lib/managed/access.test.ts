import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ account: vi.fn(), browser: vi.fn(), admin: vi.fn() }))
vi.mock("@/lib/studio/external-auth", () => ({ bearerToken: (r: Request) => r.headers.get("authorization") || "", validateExternalRequest: mocks.account }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.browser }))
vi.mock("@/lib/membership", () => ({ isAdminUser: mocks.admin }))
import { requireManagedProject } from "./server"
const request = new Request("https://studio.example", { headers: { authorization: "Bearer aih_alice" } })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue(true)
  const rows = [{ id: "my-order", user_id: "alice", payment_status: "paid" }, { id: "other-order", user_id: "bob", payment_status: "paid" }, { id: "unpaid", user_id: "alice", payment_status: "pending" }]
  const supabase = { from: () => {
    const filters: Record<string, unknown> = {}; let paid: string[] = []
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q }, in: (_key: string, values: string[]) => { paid = values; return q },
      maybeSingle: async () => ({ data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value) && (!paid.length || paid.includes(row.payment_status))) || null, error: null }) }
    return q
  } }
  mocks.account.mockResolvedValue({ user: { id: "alice" }, supabase })
})
describe("managed MCP account ownership", () => {
  it("cannot view another customer's order even for an admin account", async () => {
    await expect(requireManagedProject("other-order", request)).rejects.toMatchObject({ status: 404 })
    await expect(requireManagedProject("unpaid", request)).rejects.toMatchObject({ status: 404 })
    const own = await requireManagedProject("my-order", request)
    expect(own.project.user_id).toBe("alice")
    expect(own.isAdmin).toBe(false)
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it("uses the message permission when sending to the team", async () => {
    await requireManagedProject("my-order", request, "managed:messages")
    expect(mocks.account).toHaveBeenCalledWith(request, "managed:messages")
  })
})
