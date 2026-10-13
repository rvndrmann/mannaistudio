import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ credentials: vi.fn(), onlyOwn: vi.fn(), subscribed: vi.fn() }))
vi.mock("@/lib/byok/credential-service", () => ({ listCredentials: mocks.credentials, hasByokSubscription: mocks.subscribed }))
vi.mock("@/lib/byok/preferences", () => ({ ownKeysOnly: mocks.onlyOwn }))

import { describeJobFailure, describeKeys, describeModels, estimateGeneration, failedJobs, summarizeJob } from "./reporting"

const context = { user: { id: "user" }, project: { id: "project", metadata: {} } } as never

beforeEach(() => { mocks.credentials.mockReset().mockResolvedValue([]); mocks.onlyOwn.mockReset().mockResolvedValue(false); mocks.subscribed.mockReset().mockResolvedValue(true) })

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
  const now = Date.parse("2026-10-13T12:00:00Z")
  it("describes only the last day's failures and counts the older ones", () => {
    const result = failedJobs([
      { id: "done", status: "completed", completed_at: "2026-10-13T11:00:00Z" },
      { id: "fresh", status: "failed", error: "boom", completed_at: "2026-10-13T11:30:00Z" },
      { id: "started-only", status: "failed", created_at: "2026-10-13T02:00:00Z" },
      { id: "old", status: "failed", completed_at: "2026-10-10T07:00:00Z" },
      { id: "running", status: "processing" },
    ], now)
    expect(result.recent.map((job) => job.jobId)).toEqual(["fresh", "started-only"])
    expect(result.olderCount).toBe(1)
  })
  it("tolerates a missing list, and keeps a failure it cannot date", () => {
    expect(failedJobs(undefined)).toEqual({ recent: [], olderCount: 0 })
    expect(failedJobs([{ id: "undated", status: "failed" }], now).recent).toHaveLength(1)
  })
})

describe("summarizeJob", () => {
  it("keeps what an assistant acts on and drops the stored request", () => {
    const summary = summarizeJob({ id: "job", type: "image", status: "completed", model: "gpt-image-2", shot_id: "shot", result_url: "user/p/frame.png", credits_used: 3, created_at: "a", completed_at: "b", settings: { huge: "x".repeat(8_000) }, routing_decision: {}, prompt: "long prompt", input_images: ["a", "b"] })
    expect(summary).toEqual({ id: "job", type: "image", status: "completed", model: "gpt-image-2", shotId: "shot", resultPath: "user/p/frame.png", creditsUsed: 3, createdAt: "a", completedAt: "b" })
    expect(JSON.stringify(summary).length).toBeLessThan(300)
  })
  it("cuts a provider's essay of an error to something readable", () => {
    expect(summarizeJob({ id: "job", status: "failed", error: "e".repeat(2_000) }).error).toHaveLength(301)
  })
})

describe("describeModels", () => {
  const origin = "https://studio.example"
  const find = (list: Array<{ id: string }>, id: string) => list.find((model) => model.id === id) as Record<string, unknown> | undefined

  it("offers every model, on studio credits, when the account can spend them", async () => {
    const models = await describeModels(context, origin)
    expect(models.availableNow.imageModels.length).toBeGreaterThan(5)
    expect(models.availableNow.videoModels.length).toBeGreaterThan(5)
    expect(models.availableNow.imageModels.every((model) => (model.creditsPerImage ?? 0) >= 1 && model.runsOn === "studio credits")).toBe(true)
    expect(find(models.availableNow.imageModels, "higgsfield/ai-influencer")?.note).toContain("character reference sheet")
    expect(models.lockedUntilAKeyIsAdded).toBeUndefined()
    expect(models.warning).toBeUndefined()
    expect(models.projectDefaults.storyboardImageModel).toBeTruthy()
  })

  it("marks a model as running on the user's own key, matching Google models to a Gemini key", async () => {
    mocks.credentials.mockResolvedValue([{ provider: "gemini", status: "active", lastUsedAt: null }, { provider: "fal", status: "active", lastUsedAt: null }])
    const models = await describeModels(context, origin)
    expect(find(models.availableNow.imageModels, "google-nano-banana-2")?.runsOn).toBe("your own key")
    expect(find(models.availableNow.videoModels, "fal-kling-3")?.runsOn).toBe("your own key")
    expect(find(models.availableNow.imageModels, "gpt-image-2")?.runsOn).toBe("studio credits")
    expect(models.billing.connectedKeys.map((key) => key.provider)).toEqual(["gemini", "fal"])
  })

  it("splits what can be used from what is locked, grouped by the key that unlocks it", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    mocks.credentials.mockResolvedValue([{ provider: "higgsfield", status: "active", lastUsedAt: null }])
    const models = await describeModels(context, origin)
    expect(models.billing.ownKeysOnly).toBe(true)
    expect(models.availableNow.imageModels.every((model) => model.provider === "higgsfield")).toBe(true)
    expect(models.availableNow.videoModels.every((model) => model.provider === "higgsfield")).toBe(true)
    expect(models.availableNow.videoModels.length).toBeGreaterThan(3)
    // No studio price anywhere: this account is billed by its provider.
    expect(JSON.stringify(models.availableNow)).not.toMatch(/credits/i)
    expect(models.note).toContain("adds no charge")
    const locked = models.lockedUntilAKeyIsAdded!
    expect(locked.map((group) => group.needsKeyFrom)).toEqual(["BytePlus ModelArk", "fal.ai", "OpenAI", "Google Gemini"])
    const openai = locked.find((group) => group.needsKeyFrom === "OpenAI")!
    expect(openai).toMatchObject({ getAKeyAt: "https://platform.openai.com/api-keys", addItAt: "https://studio.example/studio/integrations" })
    expect(openai.imageModels.map((model) => model.id)).toContain("gpt-image-2")
    // A Google model is unlocked by the key the studio calls Gemini.
    expect(locked.find((group) => group.needsKeyFrom === "Google Gemini")!.videoModels.length).toBeGreaterThan(0)
  })

  it("warns when the project's own default models cannot run", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    mocks.credentials.mockResolvedValue([{ provider: "higgsfield", status: "active", lastUsedAt: null }])
    const models = await describeModels(context, origin)
    expect(models.warning).toContain("storyboardImageModel")
    expect(models.warning).toContain("videoModel")
    expect(models.warning).toContain("availableNow")
  })

  it("reports a key marked invalid as a problem and does not count it as usable", async () => {
    mocks.credentials.mockResolvedValue([{ provider: "fal", status: "invalid", lastUsedAt: null }])
    const models = await describeModels(context, origin)
    expect(find(models.availableNow.videoModels, "fal-kling-3")?.runsOn).toBe("studio credits")
    expect(models.billing.keyProblems?.[0]).toContain("fal API key is marked invalid")
  })

  it("still answers when the key list cannot be read", async () => {
    mocks.credentials.mockRejectedValue(new Error("vault down"))
    expect((await describeModels(context, origin)).billing.connectedKeys).toEqual([])
  })
})

describe("estimateGeneration", () => {
  it("prices a render on studio credits, per item", async () => {
    const estimate = await estimateGeneration(context, { type: "image", model: "fal-flux-3", count: 3 })
    expect(estimate).toMatchObject({ model: "fal-flux-3", items: 3, runsOn: "studio credits", creditsPerItem: 7, studioCredits: 21 })
  })

  it("charges nothing when the model runs on the user's own key", async () => {
    mocks.credentials.mockResolvedValue([{ provider: "higgsfield", status: "active", lastUsedAt: null }])
    const estimate = await estimateGeneration(context, { type: "video", model: "higgsfield/kling-video/o3/image-reference", count: 2, durationSeconds: 8 })
    expect(estimate).toMatchObject({ runsOn: "your own key", studioCredits: 0 })
    expect(estimate.note).toContain("higgsfield")
    mocks.onlyOwn.mockResolvedValue(true)
    const ownOnly = await estimateGeneration(context, { type: "video", model: "higgsfield/kling-video/o3/image-reference", count: 2, durationSeconds: 8 })
    expect(JSON.stringify(ownOnly)).not.toMatch(/credits/i)
    expect(ownOnly.note).toContain("adds no charge")
  })

  it("says plainly when approving would fail, and names the key that is missing", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    mocks.credentials.mockResolvedValue([{ provider: "higgsfield", status: "active", lastUsedAt: null }])
    const estimate = await estimateGeneration(context, { type: "image", model: "gpt-image-2.5-sunburst", count: 1 }, "https://studio.example")
    expect(estimate).toMatchObject({ blocked: true })
    expect(JSON.stringify(estimate)).not.toMatch(/studioCredits/)
    expect(estimate.note).toContain("your own OpenAI API key")
    expect((estimate as { missingKey?: unknown }).missingKey).toEqual({ provider: "openai", name: "OpenAI", getAKeyAt: "https://platform.openai.com/api-keys", addItAt: "https://studio.example/studio/integrations" })
  })

  it("scales a video's price with its length", async () => {
    const five = await estimateGeneration(context, { type: "video", model: "fal-kling-3", count: 1, durationSeconds: 5 })
    const ten = await estimateGeneration(context, { type: "video", model: "fal-kling-3", count: 1, durationSeconds: 10 })
    // Rounded up once at the end, so twice the length is within a credit of twice the price.
    const credits = (estimate: object) => (estimate as { studioCredits: number }).studioCredits
    expect(Math.abs(credits(ten) - credits(five) * 2)).toBeLessThanOrEqual(1)
  })
})

describe("describeKeys", () => {
  const origin = "https://studio.example"

  it("lists every provider with what it unlocks and both links", async () => {
    const keys = await describeKeys("user", origin)
    expect(keys.providers.map((entry) => entry.provider)).toEqual(["byteplus", "fal", "openai", "gemini", "higgsfield"])
    const openai = keys.providers.find((entry) => entry.provider === "openai")!
    expect(openai).toMatchObject({ name: "OpenAI", status: "missing", getAKeyAt: "https://platform.openai.com/api-keys" })
    expect(openai.unlocks.chatWithDirector).toBe(true)
    expect(openai.unlocks.imageModels).toContain("GPT Image 2")
    expect(keys.providers.find((entry) => entry.provider === "higgsfield")!.unlocks.chatWithDirector).toBe(false)
    // A Google image model is unlocked by the key the studio calls Gemini.
    expect(keys.providers.find((entry) => entry.provider === "gemini")!.unlocks.imageModels.length).toBeGreaterThan(0)
    expect(keys.addKeysAt).toBe("https://studio.example/studio/integrations")
  })

  it("does not nag about missing keys when studio credits cover them", async () => {
    const keys = await describeKeys("user", origin)
    expect(keys.missing).toBeUndefined()
    expect(keys.actionNeeded).toBeUndefined()
    expect(keys.mode).toContain("studio credits")
  })

  it("says what to add, and that the Director cannot speak, when only a video key is connected", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    mocks.credentials.mockResolvedValue([{ provider: "higgsfield", status: "active", lastUsedAt: null }])
    const keys = await describeKeys("user", origin)
    expect(keys.providers.find((entry) => entry.provider === "higgsfield")!.status).toBe("connected")
    expect(keys.missing).toHaveLength(4)
    expect(keys.missing!.join(" ")).toContain("OpenAI: get a key at https://platform.openai.com/api-keys, then add it at https://studio.example/studio/integrations")
    expect(keys.actionNeeded!.join(" ")).toContain("AI Director chat needs an OpenAI or Google Gemini key")
    expect(keys.actionNeeded!.join(" ")).not.toContain("No provider key is connected")
  })

  it("flags an invalid key, a missing subscription and an account with no key at all", async () => {
    mocks.onlyOwn.mockResolvedValue(true)
    mocks.subscribed.mockResolvedValue(false)
    mocks.credentials.mockResolvedValue([{ provider: "fal", status: "invalid", lastUsedAt: null }])
    const keys = await describeKeys("user", origin)
    expect(keys.providers.find((entry) => entry.provider === "fal")!.status).toBe("invalid")
    const actions = keys.actionNeeded!.join(" ")
    expect(actions).toContain("active subscription is required")
    expect(actions).toContain("fal.ai key is marked invalid")
    expect(actions).toContain("No provider key is connected")
  })
})
