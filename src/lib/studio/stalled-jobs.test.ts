import { describe, expect, it } from "vitest"
import { isStalledImageJob, isStalledVideoJob, STALLED_IMAGE_JOB_MS, STALLED_VIDEO_JOB_MS } from "./stalled-jobs"

const now = Date.parse("2026-08-24T05:30:00.000Z")
const ago = (ms: number) => new Date(now - ms).toISOString()

describe("settling an orphaned image job", () => {
  it("settles a job stuck in approved that never reached processing", () => {
    // The exact shape that spun for ever: approved, no started_at, long past.
    expect(isStalledImageJob({ status: "approved", started_at: null, created_at: ago(33 * 60 * 1000) }, now)).toBe(true)
  })

  it("settles a processing job that outran any real generation", () => {
    expect(isStalledImageJob({ status: "processing", started_at: ago(28 * 60 * 1000) }, now)).toBe(true)
  })

  it("leaves a young approved job alone — it may still be about to run", () => {
    expect(isStalledImageJob({ status: "approved", created_at: ago(30 * 1000) }, now)).toBe(false)
  })

  it("dates an approved job from approved_at when it has one", () => {
    expect(isStalledImageJob({ status: "approved", approved_at: ago(10 * 1000), created_at: ago(60 * 60 * 1000) }, now)).toBe(false)
  })

  it("never touches a terminal job", () => {
    expect(isStalledImageJob({ status: "completed", started_at: ago(60 * 60 * 1000) }, now)).toBe(false)
    expect(isStalledImageJob({ status: "failed", started_at: ago(60 * 60 * 1000) }, now)).toBe(false)
  })

  it("uses a six-minute threshold", () => {
    expect(isStalledImageJob({ status: "processing", started_at: ago(STALLED_IMAGE_JOB_MS - 1_000) }, now)).toBe(false)
    expect(isStalledImageJob({ status: "processing", started_at: ago(STALLED_IMAGE_JOB_MS + 1_000) }, now)).toBe(true)
  })
})

/**
 * BytePlus accepts a video task and then either progresses it — moving its own
 * updated_at — or leaves the timestamp exactly at created_at because the queue
 * never picked it up. The second case reports "running" for up to two days, so
 * the shot span its generating animation the whole time and the reserved
 * credits were never returned.
 */
describe("a video the provider never started", () => {
  const providerAt = (createdSecAgo: number, updatedSecAgo: number) => ({
    status: "running",
    created_at: Math.floor((now - createdSecAgo * 1000) / 1000),
    updated_at: Math.floor((now - updatedSecAgo * 1000) / 1000),
  })

  it("settles a task held at its created_at past the threshold", () => {
    // The real failure: accepted 41 minutes ago, never touched since.
    const job = { status: "processing", started_at: ago(41 * 60 * 1000) }
    expect(isStalledVideoJob(job, providerAt(41 * 60, 41 * 60), now)).toBe(true)
  })

  it("leaves a slow render alone once the provider has touched it", () => {
    // updated_at has moved past created_at, so the queue picked the task up and
    // it is rendering — slow is not stalled.
    const job = { status: "processing", started_at: ago(41 * 60 * 1000) }
    expect(isStalledVideoJob(job, providerAt(41 * 60, 10 * 60), now)).toBe(false)
  })

  it("gives a fresh task time before calling it stalled", () => {
    const job = { status: "processing", started_at: ago(60 * 1000) }
    expect(isStalledVideoJob(job, providerAt(60, 60), now)).toBe(false)
  })

  it("never touches a job the provider already settled", () => {
    const job = { status: "processing", started_at: ago(60 * 60 * 1000) }
    for (const status of ["succeeded", "failed", "cancelled"]) {
      expect(isStalledVideoJob(job, { ...providerAt(60 * 60, 60 * 60), status }, now)).toBe(false)
    }
  })

  it("does not guess when the provider sent no timestamps", () => {
    // Without both clocks a stall cannot be told from a slow render, and failing
    // the job on a guess would discard work that was really happening.
    const job = { status: "processing", started_at: ago(60 * 60 * 1000) }
    expect(isStalledVideoJob(job, { status: "running" }, now)).toBe(false)
  })

  it("never touches a terminal job of our own", () => {
    expect(isStalledVideoJob({ status: "completed", started_at: ago(60 * 60 * 1000) }, providerAt(60 * 60, 60 * 60), now)).toBe(false)
  })

  it("uses an eight-minute threshold", () => {
    const under = { status: "processing", started_at: ago(STALLED_VIDEO_JOB_MS - 1_000) }
    const over = { status: "processing", started_at: ago(STALLED_VIDEO_JOB_MS + 1_000) }
    expect(isStalledVideoJob(under, providerAt(STALLED_VIDEO_JOB_MS / 1000, STALLED_VIDEO_JOB_MS / 1000), now)).toBe(false)
    expect(isStalledVideoJob(over, providerAt(STALLED_VIDEO_JOB_MS / 1000, STALLED_VIDEO_JOB_MS / 1000), now)).toBe(true)
  })
})

describe("a video job that never reached the provider", () => {
  const now = Date.now()
  const ago = (ms: number) => new Date(now - ms).toISOString()

  /**
   * Approved, then the process that would have submitted it went away. There is
   * no provider task to ask about, so the checks written against the provider's
   * clocks can never settle it: the status endpoint answered every poll with
   * "missing provider details" while the workspace showed the shot generating,
   * and the two took turns for ever with the credits still held.
   */
  it("settles one that has held no provider id past the submission window", () => {
    const job = { status: "approved", approved_at: ago(7 * 60 * 1000), provider_job_id: null }
    expect(isStalledVideoJob(job, null, now)).toBe(true)
  })

  it("gives a job still being submitted time to get there", () => {
    const job = { status: "approved", approved_at: ago(30 * 1000), provider_job_id: null }
    expect(isStalledVideoJob(job, null, now)).toBe(false)
  })

  it("leaves a submitted job to the provider checks", () => {
    const job = { status: "processing", started_at: ago(60 * 1000), provider_job_id: "task-1" }
    expect(isStalledVideoJob(job, { status: "running", created_at: Math.floor((now - 60_000) / 1000), updated_at: Math.floor((now - 30_000) / 1000) }, now)).toBe(false)
  })
})
