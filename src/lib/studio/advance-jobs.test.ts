import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ images: vi.fn(), videos: vi.fn() }))
vi.mock("./poll-images", () => ({ pollImages: mocks.images }))
vi.mock("./poll-videos", () => ({ pollVideos: mocks.videos }))

import { advanceGenerationJobs } from "./advance-jobs"

function context(jobs: Array<{ id: string; type: string }>, error: unknown = null) {
  const filters: Record<string, unknown> = {}
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query },
    in: (key: string, value: unknown) => { filters[key] = value; return query },
    order: () => query,
    limit: async (count: number) => { filters.limit = count; return { data: jobs, error } },
  }
  return { filters, value: { supabase: { from: () => query }, project: { id: "project" }, user: { id: "user" } } as never }
}

beforeEach(() => { mocks.images.mockReset().mockResolvedValue({}); mocks.videos.mockReset().mockResolvedValue({}) })

describe("advanceGenerationJobs", () => {
  it("asks only for this user's unfinished jobs in this project, a few at a time", async () => {
    const { filters, value } = context([])
    expect(await advanceGenerationJobs(value, "https://studio.example")).toEqual({ checked: 0, stillWorking: false })
    expect(filters).toMatchObject({ project_id: "project", user_id: "user", status: ["queued", "approved", "generating", "processing"], type: ["image", "video"], limit: 8 })
    expect(mocks.images).not.toHaveBeenCalled()
  })

  it("sends each job to the poll that owns its kind, as the caller", async () => {
    const { value } = context([{ id: "img-1", type: "image" }, { id: "vid-1", type: "video" }])
    expect(await advanceGenerationJobs(value, "https://studio.example")).toEqual({ checked: 2, stillWorking: false })
    const [imageRequest, , imageContext] = mocks.images.mock.calls[0]
    expect(imageRequest.url).toBe("https://studio.example/api/studio/projects/project/images?jobId=img-1")
    expect(imageContext).toBe(value)
    expect(mocks.videos.mock.calls[0][0].url).toBe("https://studio.example/api/studio/projects/project/videos?jobId=vid-1")
  })

  it("does not let one failing job stop the others", async () => {
    mocks.images.mockRejectedValue(new Error("provider down"))
    const { value } = context([{ id: "img-1", type: "image" }, { id: "vid-1", type: "video" }])
    expect(await advanceGenerationJobs(value, "https://studio.example")).toEqual({ checked: 2, stillWorking: false })
    expect(mocks.videos).toHaveBeenCalledTimes(1)
  })

  it("answers after the wait and says the work is still going", async () => {
    mocks.videos.mockReturnValue(new Promise(() => {}))
    const { value } = context([{ id: "vid-1", type: "video" }])
    expect(await advanceGenerationJobs(value, "https://studio.example", 20)).toEqual({ checked: 1, stillWorking: true })
  })

  it("surfaces a failure to read the jobs", async () => {
    const { value } = context([], new Error("database down"))
    await expect(advanceGenerationJobs(value, "https://studio.example")).rejects.toThrow("database down")
  })
})
