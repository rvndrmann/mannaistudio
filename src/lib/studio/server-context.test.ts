import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAuthenticatedProject, StudioAccessError } from "./server-context"

function fakeClient(options: { userId?: string; project?: Record<string, unknown> | null }) {
  const filters: Array<[string, string]> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => { filters.push([column, value]); return query }),
    maybeSingle: vi.fn(async () => ({ data: options.project ?? null, error: null })),
  }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.userId ? { id: options.userId } : null }, error: null })) },
    from: vi.fn(() => query),
  } as unknown as SupabaseClient
  return { client, filters }
}

describe("requireAuthenticatedProject", () => {
  it("rejects unauthenticated access before querying projects", async () => {
    const { client } = fakeClient({})
    await expect(requireAuthenticatedProject("project-id", client)).rejects.toEqual(new StudioAccessError("Unauthorized", 401))
    expect(client.from).not.toHaveBeenCalled()
  })

  it("always scopes the project lookup to the authenticated owner", async () => {
    const { client, filters } = fakeClient({ userId: "user-1", project: { id: "project-1", user_id: "user-1" } })
    await requireAuthenticatedProject("project-1", client)
    expect(filters).toEqual([["id", "project-1"], ["user_id", "user-1"]])
  })

  it("returns not found when another user's project is not visible", async () => {
    const { client } = fakeClient({ userId: "user-1", project: null })
    await expect(requireAuthenticatedProject("other-project", client)).rejects.toMatchObject({ status: 404 })
  })
})
