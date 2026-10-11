import { expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const fixtures = vi.hoisted(() => ({ writes: [] as Record<string, unknown>[] }))
vi.mock("@/lib/studio/server-context", () => ({
  requireAuthenticatedProject: async () => ({ user: { id: "owner" }, project: { id: "project" }, supabase: { from(table: string) {
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: table === "creator_shots" ? { id: "11111111-1111-4111-8111-111111111111", episode_id: "episode", metadata: {}, referenced_entities: [] } : { id: "episode" }, error: null }),
      insert: (row: Record<string, unknown>) => { fixtures.writes.push(row); return query },
      update: (row: Record<string, unknown>) => { fixtures.writes.push(row); return query },
      single: async () => ({ data: { id: "accepted-job" }, error: null }),
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return (table === "creator_entities" ? Promise.reject(new Error("Reference preparation unavailable")) : Promise.resolve({ error: null })).then(resolve, reject)
      },
    }
    return query
  } } }),
  studioErrorMessage: (error: Error) => error.message, studioErrorStatus: () => 500,
}))
vi.mock("@/lib/byok/credential-service", () => ({ hasCredential: async () => true, withCredential: vi.fn() }))
vi.mock("@/lib/byok/preferences", () => ({ ownKeysOnly: async () => true }))
import { POST } from "./route"
it("saves and exposes a failed attempt when reference preparation fails before provider submission", async () => {
  const response = await POST(new NextRequest("http://localhost/api/video", { method: "POST", body: JSON.stringify({ shotId: "11111111-1111-4111-8111-111111111111", model: "dreamina-seedance-2-5-260628", prompt: "Footballer walks onto a pitch" }) }), { params: Promise.resolve({ projectId: "project" }) })
  expect(await response.json()).toMatchObject({ jobId: "accepted-job", error: "Reference preparation unavailable" })
  expect(fixtures.writes[0]).toMatchObject({ shot_id: "11111111-1111-4111-8111-111111111111", status: "processing", type: "video", billing_mode: "byok", credits_used: 0 })
  expect(fixtures.writes[1]).toMatchObject({ status: "failed", error: "Reference preparation unavailable" })
})
