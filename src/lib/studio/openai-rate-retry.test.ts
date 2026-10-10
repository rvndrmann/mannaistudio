import { afterEach, describe, expect, it, vi } from "vitest"
import { submitOpenAIImage } from "./openai"
import { runWithCredential } from "@/lib/byok/active-credential"
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const submit = () => runWithCredential("openai", { apiKey: "offline-test-key" }, () =>
  submitOpenAIImage({ userId: "test", model: "gpt-image-2", prompt: "An empty room" }))
describe("OpenAI temporary rate-limit retry", () => {
  it("waits for Retry-After before retrying a refused submission", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(Response.json({ id: "resp-test", status: "queued" }))
    vi.stubGlobal("fetch", fetch)
    const pending = submit()
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).responseId).toBe("resp-test")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("does not retry a billing quota refusal", async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    await expect(submit()).rejects.toThrow("429")
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("does not retry a timeout with an uncertain submission outcome", async () => {
    const fetch = vi.fn(async () => { throw new DOMException("Timed out", "TimeoutError") })
    vi.stubGlobal("fetch", fetch)
    await expect(submit()).rejects.toThrow("60s")
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
