import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { POST } from "./route"
import { pollImages } from "@/lib/studio/poll-images"
import { pollVideos } from "@/lib/studio/poll-videos"
const fixtures = vi.hoisted(() => ({ job: null as Record<string, unknown> | null, filters: [] as Array<[string, unknown]> }))
vi.mock("@/lib/studio/server-context", () => ({
  requireAuthenticatedProject: vi.fn(async () => ({ user: { id: "owner" }, project: { id: "project" }, supabase: {
    from: () => { const query = { select: () => query, eq: (key: string, value: unknown) => { fixtures.filters.push([key, value]); return query }, maybeSingle: async () => ({ data: fixtures.job, error: null }) }; return query },
  } })),
  studioErrorMessage: (error: Error) => error.message,
  studioErrorStatus: () => 500,
}))
vi.mock("@/lib/studio/poll-images", () => ({ pollImages: vi.fn(async () => NextResponse.json({ status: "completed" })) }))
vi.mock("@/lib/studio/poll-videos", () => ({ pollVideos: vi.fn(async () => NextResponse.json({ status: "processing" })) }))
const id = "11111111-1111-4111-8111-111111111111"
const submit = () => POST(new NextRequest("http://localhost/api/repoll", { method: "POST", body: JSON.stringify({ jobId: id }) }), { params: Promise.resolve({ projectId: "project" }) })
beforeEach(() => { vi.clearAllMocks(); fixtures.filters = []; fixtures.job = null })
describe("user generation re-poll", () => {
  it("restricts the lookup to the user's job in the authenticated project", async () => {
    expect((await submit()).status).toBe(404)
    expect(fixtures.filters).toEqual([["id", id], ["project_id", "project"], ["user_id", "owner"]])
    expect(pollImages).not.toHaveBeenCalled()
  })
  it("refuses jobs without provider IDs without resubmitting", async () => {
    fixtures.job = { id, type: "image", provider_job_id: null }
    expect((await submit()).status).toBe(409)
    expect(pollImages).not.toHaveBeenCalled()
    expect(pollVideos).not.toHaveBeenCalled()
  })
  it.each(["image", "video"])("re-polls existing %s jobs with terminal recovery enabled", async type => {
    fixtures.job = { id, type, provider_job_id: "saved-provider-id" }
    expect((await submit()).status).toBe(200)
    const poll = type === "image" ? pollImages : pollVideos
    expect(poll).toHaveBeenCalledOnce()
    expect(vi.mocked(poll).mock.calls[0][3]).toBe(true)
  })
})
