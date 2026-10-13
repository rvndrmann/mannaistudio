import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { handOffVideoSubmission, submitsOnVideoWorker, VIDEO_WORKER_PATH } from "./video-handoff"

afterEach(() => vi.unstubAllGlobals())

describe("which submissions leave the request", () => {
  it("sends BytePlus clips to the worker, where registering references has time to finish", () => {
    expect(submitsOnVideoWorker("dreamina-seedance-2-5-260628", "https://www.aidirectorhub.com")).toBe(true)
    expect(submitsOnVideoWorker("dreamina-seedance-2-0-fast-260128", "https://www.aidirectorhub.com")).toBe(true)
  })

  it("keeps the one-call providers in the request, so their refusals stay immediate", () => {
    expect(submitsOnVideoWorker("fal-seedance-2-5", "https://www.aidirectorhub.com")).toBe(false)
    expect(submitsOnVideoWorker("higgsfield/cinema-studio/4.0", "https://www.aidirectorhub.com")).toBe(false)
  })

  it("never hands off beside a local dev server, which has no worker", () => {
    expect(submitsOnVideoWorker("dreamina-seedance-2-5-260628", "http://localhost:3000")).toBe(false)
    expect(submitsOnVideoWorker("dreamina-seedance-2-5-260628", "http://127.0.0.1:3001")).toBe(false)
  })

  it("leaves an unknown model for the submission's own validation to refuse", () => {
    expect(submitsOnVideoWorker("not-a-model", "https://www.aidirectorhub.com")).toBe(false)
    expect(submitsOnVideoWorker(undefined, "https://www.aidirectorhub.com")).toBe(false)
  })
})

describe("handing a job to the worker", () => {
  const input = { origin: "https://www.aidirectorhub.com", accessToken: "token", projectId: "project", jobId: "job", request: { model: "m" } }

  it("posts the job and the caller's own token to the worker", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await handOffVideoSubmission(input)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://www.aidirectorhub.com${VIDEO_WORKER_PATH}`)
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token")
    expect(JSON.parse(String(init.body))).toEqual({ projectId: "project", jobId: "job", request: { model: "m" } })
  })

  it("treats anything but the worker's 202 as a refusal", async () => {
    // A deploy without the function answers 404, and a page can answer 200 in
    // its place. Either read as accepted would leave the job with nobody
    // submitting it.
    for (const status of [200, 404, 500]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status })))
      expect(await handOffVideoSubmission(input)).toBe(false)
    }
  })

  it("treats a hand-off that never answered as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timed out") }))
    expect(await handOffVideoSubmission(input)).toBe(false)
  })
})

describe("the worker and the route submit with the same code", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

  it("has both call submitProjectVideo", () => {
    expect(read("src/app/api/studio/projects/[projectId]/videos/route.ts")).toContain("submitProjectVideo(")
    expect(read("src/lib/studio/video-worker-entry.ts")).toContain("submitProjectVideo(")
  })

  it("builds the worker under the name the route posts to", () => {
    expect(read("scripts/build-netlify-functions.mjs")).toContain(`netlify/functions/${VIDEO_WORKER_PATH.split("/").pop()}.mjs`)
  })

  it("builds the worker before the app, so a deploy cannot ship without it", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    expect(scripts.build).toMatch(/build-netlify-functions\.mjs && next build/)
  })

  it("never lets the worker throw, because the host runs a failed one again", () => {
    const worker = read("src/lib/studio/video-worker-entry.ts")
    expect(worker).toContain("} catch (error) {")
    expect(worker).not.toMatch(/\bthrow\b/)
  })
})
