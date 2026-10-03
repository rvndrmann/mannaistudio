import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import type { AuthenticatedProjectContext } from "./server-context"
import { pollImages } from "./poll-images"
import { retrieveOpenAIImage } from "./openai"
vi.mock("./openai", () => ({ retrieveOpenAIImage: vi.fn(async () => ({ status: "pending" })) }))
function context(job: Record<string, unknown>) {
  const query = { update: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve), select: () => query, eq: () => query, maybeSingle: async () => ({ data: job, error: null }) }
  return { supabase: { from: () => query }, user: { id: "user" }, project: { id: "project" } } as unknown as AuthenticatedProjectContext
}
const request = () => new NextRequest("http://localhost/status?jobId=job")
const params = () => ({ params: Promise.resolve({ projectId: "project" }) })
describe("admin image re-poll", () => {
  it("checks the saved response of a previously failed job", async () => {
    vi.clearAllMocks()
    const response = await pollImages(request(), params(), context({ id: "job", user_id: "user", provider: "openai", provider_job_id: "resp-saved", status: "failed" }), true)
    expect(retrieveOpenAIImage).toHaveBeenCalledWith("resp-saved", "user")
    expect((await response.json()).providerStatus).toBe("pending")
  })
  it("refuses recovery without an ID instead of submitting another generation", async () => {
    vi.clearAllMocks()
    const response = await pollImages(request(), params(), context({ id: "job", status: "failed", provider_job_id: null }), true)
    expect(response.status).toBe(409)
    expect(retrieveOpenAIImage).not.toHaveBeenCalled()
  })
  it("keeps ordinary polling terminal and completed results idempotent", async () => {
    vi.clearAllMocks()
    await pollImages(request(), params(), context({ id: "job", status: "failed", provider_job_id: "resp-saved" }))
    await pollImages(request(), params(), context({ id: "job", status: "completed", provider_job_id: "resp-saved" }), true)
    expect(retrieveOpenAIImage).not.toHaveBeenCalled()
  })
})
