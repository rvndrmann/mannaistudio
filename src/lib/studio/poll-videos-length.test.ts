import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { deliveredLength } from "./poll-videos"

describe("deliveredLength", () => {
  it("records a clip that came back shorter than it was asked to be", () => {
    const length = deliveredLength({ provider_request: { duration: 10 } }, { duration: 4, status: "succeeded" })
    expect(length).toMatchObject({ requestedSeconds: 10, deliveredSeconds: 4 })
    expect(length?.note).toContain("returned a 4 second clip; 10 seconds were requested")
  })

  it("says nothing more when the length matches", () => {
    expect(deliveredLength({ provider_request: { duration: 12 } }, { duration: 12 })).toEqual({ requestedSeconds: 12, deliveredSeconds: 12 })
  })

  it("falls back to the job's own settings for what was asked", () => {
    expect(deliveredLength({ settings: { durationSeconds: 8 } }, { duration: 5 })?.requestedSeconds).toBe(8)
  })

  it("makes no claim for a provider that does not state the length", () => {
    expect(deliveredLength({ provider_request: { duration: 10 } }, { status: "succeeded" })).toBeNull()
    expect(deliveredLength({}, { duration: 4 })).toBeNull()
    expect(deliveredLength({ provider_request: { duration: 10 } }, null)).toBeNull()
  })
})
