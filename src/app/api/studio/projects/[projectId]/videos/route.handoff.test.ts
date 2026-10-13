import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  handOff: vi.fn(),
  onWorker: vi.fn(),
  session: vi.fn(async () => ({ data: { session: { access_token: "user-token" } } })),
}))

vi.mock("@/lib/studio/project-video-submit", () => ({ submitProjectVideo: mocks.submit }))
vi.mock("@/lib/studio/video-handoff", () => ({ handOffVideoSubmission: mocks.handOff, submitsOnVideoWorker: mocks.onWorker }))
vi.mock("@/lib/studio/poll-videos", () => ({ pollVideos: vi.fn() }))
vi.mock("@/lib/studio/server-context", () => ({
  requireAuthenticatedProject: vi.fn(async () => ({ user: { id: "user" }, supabase: { auth: { getSession: mocks.session } } })),
  studioErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
  studioErrorStatus: () => 500,
}))

import { POST } from "./route"

const post = (body: unknown) => POST(
  new NextRequest("https://www.aidirectorhub.com/api/studio/projects/project/videos", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ projectId: "project" }) },
)

beforeEach(() => {
  mocks.submit.mockReset()
  mocks.handOff.mockReset()
  mocks.onWorker.mockReset()
})

describe("POST /videos", () => {
  it("submits a one-call provider in the request and returns its answer", async () => {
    mocks.onWorker.mockReturnValue(false)
    mocks.submit.mockResolvedValue({ body: { jobId: "job", providerJobId: "task", status: "processing" }, status: 202 })
    const response = await post({ model: "fal-seedance-2-5" })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ providerJobId: "task" })
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit.mock.calls[0][3]).toBeUndefined()
    expect(mocks.handOff).not.toHaveBeenCalled()
  })

  it("accepts a BytePlus clip, hands it to the worker and answers at once", async () => {
    mocks.onWorker.mockReturnValue(true)
    mocks.submit.mockResolvedValue({ body: { jobId: "job", status: "accepted", provider: "byteplus" }, status: 202 })
    mocks.handOff.mockResolvedValue(true)
    const response = await post({ model: "dreamina-seedance-2-5-260628" })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ jobId: "job", status: "processing", submitting: true })
    // Accepted only: the slow part must not also run here.
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit.mock.calls[0][3]).toEqual({ acceptOnly: true })
    expect(mocks.handOff.mock.calls[0][0]).toMatchObject({ accessToken: "user-token", projectId: "project", jobId: "job" })
  })

  it("submits in the request when no worker took the job", async () => {
    mocks.onWorker.mockReturnValue(true)
    mocks.submit
      .mockResolvedValueOnce({ body: { jobId: "job", status: "accepted" }, status: 202 })
      .mockResolvedValueOnce({ body: { jobId: "job", providerJobId: "task", status: "processing" }, status: 202 })
    mocks.handOff.mockResolvedValue(false)
    const response = await post({ model: "dreamina-seedance-2-5-260628" })
    expect(await response.json()).toMatchObject({ providerJobId: "task" })
    expect(mocks.submit.mock.calls[1][3]).toEqual({ acceptedJobId: "job" })
  })

  it("returns a refusal made before the job existed without handing anything off", async () => {
    mocks.onWorker.mockReturnValue(true)
    mocks.submit.mockResolvedValue({ body: { error: "Shot not found" }, status: 404 })
    const response = await post({ model: "dreamina-seedance-2-5-260628" })
    expect(response.status).toBe(404)
    expect(mocks.handOff).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })
})
