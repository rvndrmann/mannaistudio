import { beforeEach, describe, expect, it, vi } from "vitest"

const sendCapiEvent = vi.fn()
vi.mock("@/lib/meta-capi", () => ({ sendCapiEvent: (...args: unknown[]) => sendCapiEvent(...args) }))

import { trackGenerationActivation } from "./activation"

function supabaseReturning(result: { data?: unknown; error?: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) } as never
}

beforeEach(() => {
  sendCapiEvent.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("trackGenerationActivation", () => {
  it("reports FirstGeneration when the profile's lifetime count reaches one", async () => {
    await trackGenerationActivation({ supabase: supabaseReturning({ data: 1 }), userId: "p1", email: "a@b.com" })
    expect(sendCapiEvent).toHaveBeenCalledTimes(1)
    expect(sendCapiEvent.mock.calls[0][0]).toMatchObject({
      eventName: "FirstGeneration",
      eventId: "firstgen-p1",
      externalId: "p1",
      email: "a@b.com",
    })
  })

  it("reports SecondGeneration on the second", async () => {
    await trackGenerationActivation({ supabase: supabaseReturning({ data: 2 }), userId: "p1" })
    expect(sendCapiEvent.mock.calls[0][0]).toMatchObject({ eventName: "SecondGeneration", eventId: "secondgen-p1" })
  })

  it("reports nothing on any later generation", async () => {
    for (const count of [3, 4, 50]) {
      sendCapiEvent.mockReset()
      await trackGenerationActivation({ supabase: supabaseReturning({ data: count }), userId: "p1" })
      expect(sendCapiEvent).not.toHaveBeenCalled()
    }
  })

  it("reports nothing when the counter could not be read", async () => {
    // A missing profile returns null. Guessing "this must be the first" there
    // would report an activation for a user we know nothing about.
    await trackGenerationActivation({ supabase: supabaseReturning({ data: null }), userId: "p1" })
    expect(sendCapiEvent).not.toHaveBeenCalled()
  })

  it("swallows a counter failure — a successful generation is still a success", async () => {
    const supabase = supabaseReturning({ error: { message: "rpc down" } })
    await expect(trackGenerationActivation({ supabase, userId: "p1" })).resolves.toBeUndefined()
    expect(sendCapiEvent).not.toHaveBeenCalled()
  })

  it("swallows a reporting failure too", async () => {
    sendCapiEvent.mockRejectedValueOnce(new Error("meta down"))
    const supabase = supabaseReturning({ data: 1 })
    await expect(trackGenerationActivation({ supabase, userId: "p1" })).resolves.toBeUndefined()
  })
})
