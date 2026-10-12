import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("./tool-service", () => ({ requestDirectorTool: mocks.request }))

import { proposeOwnGeneration, saveOwnPrompts } from "./own-prompts"

const EPISODE = "11111111-1111-4111-8111-111111111111"
const ENTITY = "22222222-2222-4222-8222-222222222222"
const shots = [{ id: "shot-a", order_index: 0 }, { id: "shot-b", order_index: 1 }, { id: "shot-c", order_index: 2 }]

function context(defaultAspect: string | null = "16:9") {
  const order = vi.fn().mockResolvedValue({ data: shots, error: null })
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ order }) }) }))
  return { supabase: { from }, project: { id: "project", default_aspect: defaultAspect }, user: { id: "user" } } as never
}

beforeEach(() => { mocks.request.mockReset(); mocks.request.mockResolvedValue({ approvalRequired: true, proposal: { id: "proposal" } }) })

describe("saveOwnPrompts", () => {
  it("writes each prompt as given, straight to the shot it names, without an approval card", async () => {
    const result = await saveOwnPrompts(context(), EPISODE, { shots: [{ shotNumber: 2, imagePrompt: "  A red door, low sun.  ", videoPrompt: "0-4s: the door opens." }] })
    expect(mocks.request).toHaveBeenCalledTimes(1)
    const [, call, options] = mocks.request.mock.calls[0]
    expect(call).toMatchObject({ tool: "update_shot", input: { shotId: "shot-b", patch: { prompt: "A red door, low sun.", video_prompt: "0-4s: the door opens." } } })
    expect(options).toEqual({ userAuthored: true })
    expect(result.saved).toEqual([{ shotNumber: 2, saved: ["imagePrompt", "videoPrompt"] }])
  })

  it("leaves the other prompt alone when only one is sent", async () => {
    await saveOwnPrompts(context(), EPISODE, { shots: [{ shotNumber: 1, videoPrompt: "0-3s: she turns." }] })
    expect(mocks.request.mock.calls[0][1].input.patch).toEqual({ video_prompt: "0-3s: she turns." })
  })

  it("saves a character or asset prompt as its description", async () => {
    await saveOwnPrompts(context(), EPISODE, { entities: [{ entityId: ENTITY, prompt: "Tall runner, grey hoodie." }] })
    expect(mocks.request.mock.calls[0][1]).toMatchObject({ tool: "update_asset", input: { assetId: ENTITY, patch: { description: "Tall runner, grey hoodie." } } })
    expect(mocks.request.mock.calls[0][2]).toEqual({ userAuthored: true })
  })

  it("saves nothing when one shot number is wrong", async () => {
    await expect(saveOwnPrompts(context(), EPISODE, { shots: [{ shotNumber: 1, imagePrompt: "ok" }, { shotNumber: 9, imagePrompt: "missing" }] })).rejects.toThrow("Shot 9 does not exist in this episode. It has 3 shots.")
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("refuses an empty request and a shot with no prompt", async () => {
    await expect(saveOwnPrompts(context(), EPISODE, {})).rejects.toThrow()
    await expect(saveOwnPrompts(context(), EPISODE, { shots: [{ shotNumber: 1 }] })).rejects.toThrow()
  })
})

describe("proposeOwnGeneration", () => {
  it("asks for a storyboard image from the user's prompt, keyed to the shot's id, and never bypasses approval", async () => {
    await proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_image", shotNumbers: [3, 1], prompts: { "3": "A wide of the stadium." } })
    const [, call, options] = mocks.request.mock.calls[0]
    // The user's own request, so a named image model stands. Approval is
    // decided by the tool being costly, which this flag cannot change.
    expect(options).toEqual({ userAuthored: true })
    expect(call.tool).toBe("submit_generation")
    expect(call.input.request).toEqual({ type: "image", shotIds: ["shot-c", "shot-a"], episodeId: EPISODE, aspectRatio: "16:9" })
    // Shot 1 has no prompt here, so it is left to the one already saved.
    expect(call.input.prompts).toEqual({ "shot-c": "A wide of the stadium." })
  })

  it("passes video settings through and prefers the caller's aspect ratio", async () => {
    await proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_video", shotNumbers: [2], model: "fal-kling-3", durationSeconds: 8, aspectRatio: "9:16", resolution: "1080p", idempotencyKey: "retry-key-1" })
    const call = mocks.request.mock.calls[0][1]
    expect(call.idempotencyKey).toBe("retry-key-1")
    expect(call.input.request).toEqual({ type: "video", shotIds: ["shot-b"], episodeId: EPISODE, model: "fal-kling-3", durationSeconds: 8, aspectRatio: "9:16", resolution: "1080p" })
  })

  it("leaves the aspect ratio to the default when the project has none", async () => {
    await proposeOwnGeneration(context(null), EPISODE, { kind: "storyboard_image", shotNumbers: [1] })
    expect(mocks.request.mock.calls[0][1].input.request).toEqual({ type: "image", shotIds: ["shot-a"], episodeId: EPISODE })
  })

  it("asks for character art with only the prompts that belong to the named entities", async () => {
    await proposeOwnGeneration(context(), EPISODE, { kind: "character_or_asset_image", entityIds: [ENTITY], prompts: { [ENTITY]: "Studio portrait, soft key.", "3": "not an entity" } })
    const call = mocks.request.mock.calls[0][1]
    expect(call.tool).toBe("generate_entity_reference_art")
    expect(call.input).toMatchObject({ entityIds: [ENTITY], prompts: { [ENTITY]: "Studio portrait, soft key." } })
  })

  it("keeps a named image model and refuses one that is not offered, or is the wrong kind", async () => {
    await proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_image", shotNumbers: [1], model: "fal-flux-3" })
    expect(mocks.request.mock.calls[0][1].input.request.model).toBe("fal-flux-3")
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_image", shotNumbers: [1], model: "made-up-model" })).rejects.toThrow("studio_list_models")
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_video", shotNumbers: [1], model: "fal-flux-3" })).rejects.toThrow("not a video model")
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "character_or_asset_image", entityIds: [ENTITY], model: "fal-kling-3" })).rejects.toThrow("not an image model")
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  it("says what is missing rather than guessing a target", async () => {
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_video" })).rejects.toThrow("shotNumbers")
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "character_or_asset_image" })).rejects.toThrow("entityIds")
  })
})
