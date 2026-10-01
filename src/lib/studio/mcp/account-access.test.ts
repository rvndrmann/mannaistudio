import { describe, expect, it, vi } from "vitest"
import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { requireProjectForUser } from "@/lib/studio/external-auth"
import { requireMcpEpisode, requireMcpSession } from "./account-access"
function context(rows: Record<string, Record<string, unknown>[]>) {
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: (rows[table] || []).find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) || null, error: null }),
    }
    return query
  })
  return { user: { id: "alice" }, project: { id: "alice-project", user_id: "alice" }, supabase: { from } } as unknown as AuthenticatedProjectContext
}
describe("owned-account boundaries", () => {
  it("denies another owner's project even when a client can read shared rows", async () => {
    const c = context({ creator_projects: [{ id: "bob-project", user_id: "bob" }, { id: "alice-project", user_id: "alice" }] })
    await expect(requireProjectForUser(c.supabase, c.user, "bob-project")).rejects.toMatchObject({ status: 404 })
    expect((await requireProjectForUser(c.supabase, c.user, "alice-project")).project.id).toBe("alice-project")
  })
  it("does not accept an episode from another owned or shared project", async () => {
    const c = context({ creator_episodes: [{ id: "foreign-episode", project_id: "bob-project" }, { id: "my-episode", project_id: "alice-project" }] })
    await expect(requireMcpEpisode(c, "foreign-episode")).rejects.toMatchObject({ status: 404 })
    expect(await requireMcpEpisode(c, "my-episode")).toBe("my-episode")
  })
  it("requires both the episode and the signed-in owner for a supplied session", async () => {
    const c = context({ creator_chat_sessions: [
      { id: "bob-session", episode_id: "episode", user_id: "bob" },
      { id: "other-episode-session", episode_id: "other", user_id: "alice" },
      { id: "my-session", episode_id: "episode", user_id: "alice" },
    ] })
    await expect(requireMcpSession(c, "episode", "bob-session")).rejects.toMatchObject({ status: 404 })
    await expect(requireMcpSession(c, "episode", "other-episode-session")).rejects.toMatchObject({ status: 404 })
    await expect(requireMcpSession(c, "episode", "my-session")).resolves.toBeUndefined()
  })
})
