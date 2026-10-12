import { afterEach, describe, expect, it, vi } from "vitest"
import { HIGGSFIELD_AI_INFLUENCER_MODEL, submitAiInfluencerSheet } from "./higgsfield"
import { generationProvider, imageModelRequiresReference, isCharacterSheetImageModel, isImageGenerationModel, projectDefaultImageModels } from "./generation-models"
import { calculateCreditCost } from "./credits"
import { imageAdapterReferenceLimit } from "./image-prompt-composition"
import { routeGeneration } from "./model-routing"

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const accept = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ request_id: "req_1", status: "queued" }), { status: 200 }))
const sentBody = (request: ReturnType<typeof accept>) => JSON.parse(String(request.mock.calls[0][1]?.body))

describe("AI Influencer on Higgsfield", () => {
  it("is offered as a Higgsfield image model that can start from nothing", () => {
    expect(isImageGenerationModel(HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe("higgsfield")
    expect(imageModelRequiresReference(HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe(false)
    // One identity photo plus three items.
    expect(imageAdapterReferenceLimit(HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe(4)
  })

  it("prices a sheet at $0.05 on the Higgsfield rate, whatever quality is asked for", () => {
    expect(calculateCreditCost(HIGGSFIELD_AI_INFLUENCER_MODEL, "image")).toBe(Math.ceil(0.05 * 95.4 * 2.2))
    expect(calculateCreditCost(HIGGSFIELD_AI_INFLUENCER_MODEL, "image", 5, { quality: "Max", resolution: "4K" })).toBe(11)
  })

  it("is never a project default and never what routing falls back to", () => {
    expect(isCharacterSheetImageModel(HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe(true)
    expect(projectDefaultImageModels.some((model) => model.id === HIGGSFIELD_AI_INFLUENCER_MODEL)).toBe(false)
    for (const preference of ["quality", "balanced", "speed", "cost"] as const) {
      expect(routeGeneration({ type: "image", preference }).selected.model).not.toBe(HIGGSFIELD_AI_INFLUENCER_MODEL)
    }
  })

  it("routes to it when it is named, as an image request", () => {
    const routed = routeGeneration({ type: "image", model: HIGGSFIELD_AI_INFLUENCER_MODEL })
    expect(routed.selected.model).toBe(HIGGSFIELD_AI_INFLUENCER_MODEL)
    expect(routed.creditsPerShot).toBe(11)
  })

  it("posts the documented body to the model's own path", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    const task = await submitAiInfluencerSheet({ brief: "  A tall athletic runner  ", tier: "cats", seed: 42817 })
    expect(task.id).toBe("req_1")
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/higgsfield/ai-influencer")
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Key key-id:key-secret" } })
    expect(sentBody(request)).toEqual({ tier: "cats", brief: "A tall athletic runner", seed: 42817 })
  })

  it("sends the first reference as the identity photo and the next three as items", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    await submitAiInfluencerSheet({ referenceUrls: ["https://x.test/me.jpg", "asset://not-fetchable", "https://x.test/a.png", "https://x.test/b.png", "https://x.test/c.png", "https://x.test/d.png"] })
    expect(sentBody(request)).toEqual({
      tier: "normal",
      image_url: "https://x.test/me.jpg",
      item_image_urls: ["https://x.test/a.png", "https://x.test/b.png", "https://x.test/c.png"],
    })
  })

  it("falls back to the default character type and leaves empty inputs out", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    await submitAiInfluencerSheet({ tier: "dragons", brief: "   " })
    expect(sentBody(request)).toEqual({ tier: "normal" })
  })

  it("refuses an overlong brief before anything is sent", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    await expect(submitAiInfluencerSheet({ brief: "x".repeat(4_001) })).rejects.toThrow("at most 4000")
    expect(request).not.toHaveBeenCalled()
  })
})
