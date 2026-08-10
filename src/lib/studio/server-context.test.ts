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

  // Access is enforced by RLS (owner or shared team member) rather than an
  // explicit owner filter, which would hide projects shared with the caller.
  // The lookup must therefore never narrow beyond the project id.
  it("looks the project up by id and leaves access to row level security", async () => {
    const { client, filters } = fakeClient({ userId: "user-1", project: { id: "project-1", user_id: "user-1" } })
    await requireAuthenticatedProject("project-1", client)
    expect(filters).toEqual([["id", "project-1"]])
  })

  it("resolves a project shared by another owner", async () => {
    const { client } = fakeClient({ userId: "member-1", project: { id: "project-1", user_id: "owner-1" } })
    const context = await requireAuthenticatedProject("project-1", client)
    expect(context.project.user_id).toBe("owner-1")
    expect(context.user.id).toBe("member-1")
  })

  it("returns not found when row level security hides the project", async () => {
    const { client } = fakeClient({ userId: "user-1", project: null })
    await expect(requireAuthenticatedProject("other-project", client)).rejects.toMatchObject({ status: 404 })
  })
})
