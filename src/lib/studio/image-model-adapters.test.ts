import { afterEach, expect, it, vi } from "vitest"
const sdk = vi.hoisted(() => ({ submit: vi.fn(), config: vi.fn() }))
vi.mock("@fal-ai/client", () => ({ fal: { config: sdk.config, queue: { submit: sdk.submit } } }))
import { submitFalImage } from "./fal"
import { generateGoogleImage } from "./google"
import { submitSoulV2Image } from "./higgsfield"
import { runWithCredential } from "@/lib/byok/active-credential"
afterEach(() => vi.restoreAllMocks())
it("Flux sends the selected portrait canvas rather than a square", async () => {
  sdk.submit.mockResolvedValue({ request_id: "mock-request" })
  await runWithCredential("fal", { apiKey: "offline" }, () => submitFalImage({ model: "fal-flux-dev", prompt: "photo", aspectRatio: "9:16" }))
  expect(sdk.submit).toHaveBeenCalledWith("fal-ai/flux/dev", { input: { prompt: "photo", image_size: "portrait_16_9" } })
})
it("Flux uses a documented custom canvas for an unusual ratio", async () => {
  sdk.submit.mockResolvedValue({ request_id: "mock-request" })
  await runWithCredential("fal", { apiKey: "offline" }, () => submitFalImage({ model: "fal-flux-dev", prompt: "photo", aspectRatio: "21:9" }))
  const payload = sdk.submit.mock.calls.at(-1)![1].input
  expect(payload.image_size).toHaveProperty("width")
  expect(payload.image_size.width / payload.image_size.height).toBeCloseTo(21 / 9, 1)
})
it("text-only Flux rejects a character reference before SDK submission", async () => {
  sdk.submit.mockClear()
  await expect(runWithCredential("fal", { apiKey: "offline" }, () => submitFalImage({ model: "fal-flux-dev", prompt: "photo", referenceUrls: ["https://example.invalid/person.png"] }))).rejects.toThrow("none were silently discarded")
  expect(sdk.submit).not.toHaveBeenCalled()
})
it("Google rejects a fourth reference before fetching or calling the image API", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"))
  await expect(generateGoogleImage({ model: "google-nano-banana-2", prompt: "photo", referenceUrls: ["a", "b", "c", "d"] })).rejects.toThrow("none were silently discarded")
  expect(fetch).not.toHaveBeenCalled()
})
it("Soul rejects an overlong prompt before authentication or submission", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"))
  await expect(submitSoulV2Image({ prompt: "x".repeat(10_001), aspect_ratio: "16:9", resolution: "720p", batch_size: 1, enhance_prompt: false })).rejects.toThrow("not truncated")
  expect(fetch).not.toHaveBeenCalled()
})
