import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCreatorStudioAccess, isCreatorProjectMember } from "./entitlement"

function rpcClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }
}

describe("Creator Studio access", () => {
  it("asks the database about the signed-in caller", async () => {
    const client = rpcClient({ data: { entitled: true, purchase_window_expires_at: null, purchase_only: false }, error: null })
    expect(await getCreatorStudioAccess(client, "subscriber")).toEqual({ entitled: true, purchaseWindowExpiresAt: null, purchaseOnly: false })
    expect(client.rpc).toHaveBeenCalledWith("my_creator_studio_access")
  })

  it("does not open the Studio to a signed-in account the database turns down", async () => {
    const client = rpcClient({ data: { entitled: false, purchase_window_expires_at: null, purchase_only: false }, error: null })
    expect((await getCreatorStudioAccess(client, "ordinary-user")).entitled).toBe(false)
  })

  it("carries a timed admin grant's window through", async () => {
    const client = rpcClient({ data: { entitled: true, purchase_window_expires_at: "2026-10-24T10:00:00Z", purchase_only: true }, error: null })
    expect(await getCreatorStudioAccess(client, "trial-user")).toEqual({ entitled: true, purchaseWindowExpiresAt: "2026-10-24T10:00:00Z", purchaseOnly: true })
  })

  it("fails closed when the check cannot be made", async () => {
    const client = rpcClient({ data: null, error: { message: "function does not exist" } })
    expect((await getCreatorStudioAccess(client, "user")).entitled).toBe(false)
  })

  it("does not grant anonymous access", async () => {
    const client = rpcClient({ data: { entitled: true }, error: null })
    expect((await getCreatorStudioAccess(client, "")).entitled).toBe(false)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

describe("shared project membership", () => {
  function membershipClient(row: unknown) {
    const filters: Array<[string, string]> = []
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: string) => { filters.push([column, value]); return query }),
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    }
    return { client: { from: vi.fn(() => query) } as unknown as SupabaseClient, filters }
  }

  it("recognises a member of the project", async () => {
    const { client, filters } = membershipClient({ id: "m1" })
    expect(await isCreatorProjectMember(client, "member", "project-1")).toBe(true)
    expect(filters).toEqual([["project_id", "project-1"], ["profile_id", "member"]])
  })

  it("does not treat a stranger as a member", async () => {
    const { client } = membershipClient(null)
    expect(await isCreatorProjectMember(client, "stranger", "project-1")).toBe(false)
  })
})
