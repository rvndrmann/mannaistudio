import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ credentials: vi.fn(), onlyOwn: vi.fn() }))
vi.mock("@/lib/byok/credential-service", () => ({ listCredentials: mocks.credentials }))
vi.mock("@/lib/byok/preferences", () => ({ ownKeysOnly: mocks.onlyOwn }))

import { describeJobFailure, describeModels, failedJobs } from "./reporting"

const context = { user: { id: "user" }, project: { id: "project", metadata: {} } } as never

beforeEach(() => { mocks.credentials.mockReset().mockResolvedValue([]); mocks.onlyOwn.mockReset().mockResolvedValue(false) })

describe("describeJobFailure", () => {
  it("says it was the user's own key, and points at the key when the error does", () => {
    const failure = describeJobFailure({ id: "job", type: "video", model: "fal-kling-3", provider: "fal", billing_mode: "byok", shot_id: "shot", status: "failed", error: "401 Unauthorized: invalid API key" })
    expect(failure).toMatchObject({ jobId: "job", ranOn: "your own fal key", error: "401 Unauthorized: invalid API key", target: { shotId: "shot" } })
    expect(failure.advice).toContain("your own fal API key")
    expect(failure.advice).toContain("API keys")
  })

  it("does not blame the user's key for a failure that ran on studio credits", () => {
    const failure = describeJobFailure({ id: "job", type: "image", provider: "openai", billing_mode: "credits", entity_id: "entity", status: "failed", error: "quota exceeded" })
    expect(failure.ranOn).toBe("studio credits")
    expect(failure.advice).toContain("studio's side")
    expect(failure.target).toEqual({ entityId: "entity" })
  })

  it("keeps the provider's words for an ordinary failure and gives a reason when there is none", () => {
    expect(describeJobFailure({ provider: "fal", billing_mode: "byok", error: "The prompt was rejected by the content filter." }).advice).toBe("This ran on your own fal API key, so no studio credits were taken.")
    expect(describeJobFailure({ provider: "fal", error: "  " }).error).toBe("The provider reported a failure without a reason.")
  })
})

describe("failedJobs", () => {
  it("picks out only the failures and tolerates a missing list", () => {
    expect(failedJobs([{ id: "a", status: "completed" }, { id: "b", status: "failed", error: "boom" }, { id: "c", status: "processing" }]).map((job) => job.jobId)).toEqual(["b"])
    expect(failedJobs(undefined)).toEqual([])
  })
})

describe("describeModels", () => {
  it("lists every model with a cost and says studio credits when no key is connected", async () => {
    const models = await describeModels(context)
    expect(models.imageModels.length).toBeGreaterThan(5)
    expect(models.videoModels.length).toBeGreaterThan(5)
    expect(models.imageModels.every((model) => model.creditsPerImage >= 1 && model.runsOn === "studio credits")).toBe(true)
    expect(models.imageModels.find((model) => model.id === "higgsfield/ai-influencer")?.note).toContain("character reference sheet")
    expect(models.projectDefaults.storyboardImageModel).toBeTruthy()
  })

  it("marks a model as running on the user's own key, matching Google models to a Gemini key", async () => {
    mocks.credentials.mockResolvedValue([{ provider: "gemini", status: "active", lastUsedAt: null }, { provider: "fal", status: "active", lastUsedAt: null }])
    const models = await describeModels(context)
    expect(models.imageModels.find((model) => model.id === "google-nano-banana-2")?.runsOn).toBe("your own key")
    expect(models.videoModels.find((model) => model.id === "fal-kling-3")?.runsOn).toBe("your own key")
    expect(models.imageModels.find((model) => model.id === "gpt-image-2")?.runsOn).toBe("studio credits")
    expect(models.billing.connectedKeys.map((key) => key.provider)).toEqual(["gemini", "fal"])
  })

  it("reports a key marked invalid as a problem and does not count it as usable", async () => {
    mocks.credentials.mockResolvedValue([{ provider: "fal", status: "invalid", lastUsedAt: null }])
    const models = await describeModels(context)
    expect(models.videoModels.find((model) => model.id === "fal-kling-3")?.runsOn).toBe("studio credits")
    expect(models.billing.keyProblems?.[0]).toContain("fal API key is marked invalid")
  })

  it("says a model is unavailable when the account uses only its own keys and has none for it", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    const models = await describeModels(context)
    expect(models.billing.ownKeysOnly).toBe(true)
    expect(models.videoModels[0].runsOn).toContain("unavailable")
  })

  it("still answers when the key list cannot be read", async () => {
    mocks.credentials.mockRejectedValue(new Error("vault down"))
    expect((await describeModels(context)).billing.connectedKeys).toEqual([])
  })
})
