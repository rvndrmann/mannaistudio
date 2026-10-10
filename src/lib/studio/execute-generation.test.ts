import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthenticatedProjectContext } from "./server-context"
import { STALLED_SUBMISSION_MS } from "./stalled-jobs"
import { canClaimGeneration, claimGeneration, submissionRecoveryExpired } from "./generation-claim"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { executeGenerationJobs, dispatchImageGenerationJob } from "./execute-generation"
import { submitOpenAIImage, generateOpenAIImage } from "./openai"
import { submitFalImage, generateFalImage } from "./fal"
import { submitBytePlusVideo } from "./byteplus"

vi.mock("@/lib/byok/preferences", () => ({ ownKeysOnly: vi.fn(async () => false) }))

vi.mock("./byteplus", () => ({
  submitBytePlusVideo: vi.fn(async () => ({ id: "provider-task", response: { id: "provider-task" } })),
  generateBytePlusImage: vi.fn(),
  createBytePlusAsset: vi.fn(),
}))

vi.mock("./openai", () => ({
  submitOpenAIImage: vi.fn(async () => ({ responseId: "resp-image-1", status: "queued" })),
  generateOpenAIImage: vi.fn(),
  supportsBackgroundImageResponse: (model: string) => model !== "gpt-image-2.5-sunburst",
}))
vi.mock("./fal", () => ({
  submitFalImage: vi.fn(async () => ({ id: "fal-image-1", endpoint: "fal-ai/test" })),
  generateFalImage: vi.fn(),
  submitFalVideo: vi.fn(),
}))

const now = Date.parse("2026-09-12T00:00:00Z")
const old = new Date(now - STALLED_SUBMISSION_MS - 1).toISOString()
const fresh = new Date(now).toISOString()

type Job = Parameters<typeof canClaimGeneration>[0] & Record<string, unknown>

function fixture(overrides: Partial<Job> = {}) {
  const row: Job = {
    id: "job-1", type: "video", status: "approved", provider: "byteplus",
    model: "seedance-2-5", prompt: "A quiet hallway", settings: {},
    input_images: [], provider_job_id: null, started_at: null, requested_at: null,
    approved_at: old, billing_mode: "platform", ...overrides,
  }
  const supabase = {
    async rpc(_name: string, _args: unknown) {
      if (row.status !== "approved" || row.started_at || row.provider_job_id) return { data: false, error: null }
      Object.assign(row, { status: "processing", started_at: new Date(now).toISOString() })
      return { data: true, error: null }
    },
    from(table: string) {
      const filters: Array<(value: typeof row) => boolean> = []
      let patch: Record<string, unknown> | undefined
      let single = false
      const query = {
        select: (_columns?: string) => query,
        in: (column: string, values: unknown[]) => { filters.push(value => values.includes(value[column])); return query },
        eq: (column: string, value: unknown) => { filters.push(item => item[column] === value); return query },
        is: (column: string, value: unknown) => { filters.push(item => (item[column] ?? null) === value); return query },
        update: (value: Record<string, unknown>) => {
          // creator_job_status has no generating value, and the jobs table
          // has started_at, not a requested_at column.
          if (value.status === "generating" || "requested_at" in value) throw new Error("Invalid generation job schema")
          patch = value
          return query
        },
        maybeSingle: () => { single = true; return query },
        then(resolve: (value: unknown) => unknown) {
          const matches = table === "creator_generation_jobs" && filters.every(filter => filter(row))
          if (matches && patch) Object.assign(row, patch)
          return Promise.resolve({ data: matches ? (single ? { ...row } : [{ ...row }]) : (single ? null : []), error: null }).then(resolve)
        },
      }
      return query
    },
  }
  const context = { supabase, project: { id: "project-1" }, user: { id: "user-1" } } as unknown as AuthenticatedProjectContext
  return { row, context }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ownKeysOnly).mockResolvedValue(false)
  vi.spyOn(Date, "now").mockReturnValue(now)
})
afterEach(() => { vi.restoreAllMocks() })

describe("video submission recovery", () => {
  it.each(["approved", "processing", "generating"])("actually submits an abandoned %s job", async status => {
    const { row, context } = fixture({ status, started_at: old, requested_at: old })
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).toHaveBeenCalledOnce()
    expect(row.status).toBe("processing")
    expect(row.provider_job_id).toBe("provider-task")
  })

  it("submits a newly approved job", async () => {
    const { row, context } = fixture()
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).toHaveBeenCalledOnce()
    expect(row.provider_job_id).toBe("provider-task")
  })

  it("recovers a legacy generating job with only requested_at", async () => {
    const { row, context } = fixture({ status: "generating", requested_at: old })
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).toHaveBeenCalledOnce()
  })

  it("allows only one concurrent worker to submit", async () => {
    const { row, context } = fixture({ status: "processing", started_at: old })
    await Promise.all([executeGenerationJobs(context, [row.id]), executeGenerationJobs(context, [row.id])])
    expect(submitBytePlusVideo).toHaveBeenCalledOnce()
  })

  it.each(["failed", "cancelled", "completed", "queued"])("never submits a %s job", async status => {
    const { row, context } = fixture({ status })
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).not.toHaveBeenCalled()
  })

  it("does not steal a live direct submission or worker", () => {
    for (const status of ["approved", "generating", "processing"]) {
      expect(canClaimGeneration({ id: "job", type: "video", status, started_at: fresh }, now)).toBe(false)
    }
  })

  it("does not resubmit an existing provider task", async () => {
    const { row, context } = fixture({ provider_job_id: "existing-task" })
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).not.toHaveBeenCalled()
  })

  it("rejects a stale claim after another worker saves its provider handle", async () => {
    const { row, context } = fixture({ status: "generating", started_at: old })
    const snapshot = { ...row }
    row.provider_job_id = "just-submitted"
    expect(await claimGeneration(context.supabase, snapshot, now)).toBe(false)
    expect(row.provider_job_id).toBe("just-submitted")
  })

  it("rejects a stale claim after another poll renews its lease", async () => {
    const { row, context } = fixture({ status: "generating", started_at: old })
    const snapshot = { ...row }
    row.started_at = fresh
    expect(await claimGeneration(context.supabase, snapshot, now)).toBe(false)
  })

  // The bug this recovery had on its first day: each re-claim wrote a new
  // started_at, and the stall check measures a job with no provider id from
  // exactly that column — so the deadline moved every time anyone looked and
  // the shot span for ever. The cutoff has to be read from a clock that does
  // not move, which is why it is taken from approved_at.
  it("stops claiming once recovery has run past its cutoff, however often the lease was renewed", () => {
    const approvedAt = new Date(now - 2 * STALLED_SUBMISSION_MS - 1).toISOString()
    const renewedJustNow = { ...fixture().row, status: "processing", approved_at: approvedAt, started_at: fresh }
    expect(submissionRecoveryExpired(renewedJustNow, now)).toBe(true)
    expect(canClaimGeneration(renewedJustNow, now)).toBe(false)
  })

  it("keeps claiming while the cutoff is still ahead", () => {
    const approvedAt = new Date(now - STALLED_SUBMISSION_MS - 1).toISOString()
    const job = { ...fixture().row, status: "processing", approved_at: approvedAt, started_at: old }
    expect(submissionRecoveryExpired(job, now)).toBe(false)
    expect(canClaimGeneration(job, now)).toBe(true)
  })

  it("never expires a job that reached the provider", () => {
    const job = { ...fixture().row, provider_job_id: "provider-task", approved_at: new Date(now - 10 * STALLED_SUBMISSION_MS).toISOString() }
    expect(submissionRecoveryExpired(job, now)).toBe(false)
  })
})


describe("automated image tracking", () => {
  it("persists the OpenAI Responses ID before returning and never uses synchronous generation", async () => {
    const { row, context } = fixture({ type: "image", provider: "openai", model: "gpt-image-2" })
    await executeGenerationJobs(context, [row.id])
    expect(submitOpenAIImage).toHaveBeenCalledOnce()
    expect(generateOpenAIImage).not.toHaveBeenCalled()
    expect(row.provider_job_id).toBe("resp-image-1")
    expect(row.status).toBe("processing")
    await executeGenerationJobs(context, [row.id])
    expect(submitOpenAIImage).toHaveBeenCalledOnce()
  })
  it("persists fal's request ID and exact endpoint for image recovery", async () => {
    const { row, context } = fixture({ type: "image", provider: "fal", model: "fal-flux-dev" })
    await executeGenerationJobs(context, [row.id])
    expect(submitFalImage).toHaveBeenCalledOnce()
    expect(generateFalImage).not.toHaveBeenCalled()
    expect(row.provider_job_id).toBe("fal-image-1")
    expect(row.provider_response).toEqual({ requestId: "fal-image-1", endpoint: "fal-ai/test" })
  })
})


describe("mandatory BYOK background execution", () => {
  it("refuses to submit an old platform-billed job after the subscription changes", async () => {
    vi.mocked(ownKeysOnly).mockResolvedValue(true)
    const { row, context } = fixture()
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).not.toHaveBeenCalled()
    expect(row.status).toBe("failed")
    expect(row.error).toContain("own keys")
  })
  it("does not submit when the billing policy cannot be read", async () => {
    vi.mocked(ownKeysOnly).mockRejectedValue(new Error("Policy unavailable"))
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { row, context } = fixture()
    await executeGenerationJobs(context, [row.id])
    expect(submitBytePlusVideo).not.toHaveBeenCalled()
    log.mockRestore()
  })
})


describe("synchronous image worker dispatch", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it("waits for the worker acknowledgement using the caller token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }))
    vi.stubGlobal("fetch", fetcher)
    const { context } = fixture()
    context.generationAccessToken = "test-user-token"
    expect(await dispatchImageGenerationJob(context, "image-job")).toBe(true)
    expect(fetcher).toHaveBeenCalledWith("https://example.supabase.co/functions/v1/render-image", expect.objectContaining({ headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" }, body: JSON.stringify({ projectId: context.project.id, jobId: "image-job" }) }))
    expect(generateOpenAIImage).not.toHaveBeenCalled()
  })
  it("does not resubmit locally when the worker refuses the job", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Denied", { status: 403 })))
    const { context } = fixture()
    context.generationAccessToken = "test-user-token"
    await expect(dispatchImageGenerationJob(context, "image-job")).rejects.toThrow("did not accept")
    expect(generateOpenAIImage).not.toHaveBeenCalled()
  })
})
