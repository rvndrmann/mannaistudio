import { describe, expect, it } from "vitest"
import { isStalledImageJob, STALLED_IMAGE_JOB_MS } from "./stalled-jobs"

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
