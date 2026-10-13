import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ request: vi.fn(), fetchMedia: vi.fn(), store: vi.fn() }))
vi.mock("./tool-service", () => ({ requestDirectorTool: mocks.request }))
vi.mock("./media-import", () => ({ fetchPublicMedia: mocks.fetchMedia }))
vi.mock("./director-upload", async (original) => ({ ...await original<typeof import("./director-upload")>(), storeDirectorUpload: mocks.store }))

import { attachOwnMedia, createOwnEntities, createOwnShots, importOwnMedia, proposeOwnGeneration, saveOwnPrompts, saveOwnScript } from "./own-prompts"

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

describe("saveOwnScript", () => {
  it("saves the script whole, as the user's own, without an approval card", async () => {
    const script = "SCENE 1\nA lone player walks out.\n\nSCENE 2\nHe scores."
    const result = await saveOwnScript(context(), EPISODE, { script })
    const [, call, options] = mocks.request.mock.calls[0]
    expect(call).toMatchObject({ tool: "update_script", input: { episodeId: EPISODE, content: script } })
    expect(options).toEqual({ userAuthored: true })
    expect(result).toMatchObject({ saved: true, characters: script.length })
  })
  it("refuses an empty script", async () => {
    await expect(saveOwnScript(context(), EPISODE, { script: "   " })).rejects.toThrow()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

describe("createOwnEntities", () => {
  it("creates each one from the user's description and reports the ids back", async () => {
    mocks.request.mockResolvedValue({ data: { created: [{ id: "e1", name: "Runner", kind: "character", metadata: { big: "x".repeat(5_000) } }], skipped: [{ id: "e0", name: "Stadium", type: "scene" }] } })
    const result = await createOwnEntities(context(), { entities: [{ kind: "character", name: "Runner", prompt: "Tall, grey hoodie." }, { kind: "location", name: "Stadium", prompt: "Empty, at dawn." }] })
    const [, call, options] = mocks.request.mock.calls[0]
    expect(call.tool).toBe("create_production_entities_batch")
    expect(call.input).toEqual({ entities: [{ kind: "character", name: "Runner", description: "Tall, grey hoodie." }, { kind: "location", name: "Stadium", description: "Empty, at dawn." }], skipExisting: true })
    expect(options).toEqual({ userAuthored: true })
    expect(result.created).toEqual([{ entityId: "e1", name: "Runner", kind: "character" }])
    expect(result.alreadyExisted).toEqual([{ entityId: "e0", name: "Stadium", kind: "scene" }])
    expect(result.note).toContain("studio_generate")
  })
  it("refuses a kind the studio does not have", async () => {
    await expect(createOwnEntities(context(), { entities: [{ kind: "spaceship", name: "X", prompt: "y" }] })).rejects.toThrow()
  })
})

describe("createOwnShots", () => {
  it("adds shots with the user's prompts and never replaces the storyboard", async () => {
    mocks.request.mockResolvedValue({ data: { created: [{ id: "new-2", order_index: 4, title: "Second" }, { id: "new-1", order_index: 3, title: "First" }] } })
    const result = await createOwnShots(context(), EPISODE, { shots: [
      { title: "First", imagePrompt: "A red door, low sun.", videoPrompt: "0-2s: the door opens. 2-5s: she steps through.", durationSeconds: 5 },
      { title: "Second", imagePrompt: "A wide of the hall." },
    ] })
    const [, call, options] = mocks.request.mock.calls[0]
    expect(options).toEqual({ userAuthored: true })
    expect(call.tool).toBe("create_storyboard_batch")
    expect(call.input.replaceExisting).toBe(false)
    expect(call.input.episodeId).toBe(EPISODE)
    // A prompt that already has timed beats is passed through untouched.
    expect(call.input.shots[0]).toMatchObject({ title: "First", prompt: "A red door, low sun.", videoPrompt: "0-2s: the door opens. 2-5s: she steps through.", durationSeconds: 5, aspectRatio: "16:9" })
    // With no video prompt, the frame's words stand in, whole, as one beat.
    expect(call.input.shots[1]).toMatchObject({ prompt: "A wide of the hall.", videoPrompt: "0-4s: A wide of the hall.", durationSeconds: 4 })
    expect(result.added).toEqual([{ shotNumber: 4, shotId: "new-1", title: "First" }, { shotNumber: 5, shotId: "new-2", title: "Second" }])
    expect(result.totalShots).toBe(3)
  })
  it("wraps an untimed video prompt in one beat without changing its words", async () => {
    mocks.request.mockResolvedValue({ data: { created: [] } })
    await createOwnShots(context("9:16"), EPISODE, { insertAfterShotNumber: 0, shots: [{ title: "Run", imagePrompt: "He sprints.", videoPrompt: "He sprints down the wing and cuts inside.", durationSeconds: 6 }] })
    const call = mocks.request.mock.calls[0][1]
    expect(call.input.insertAfterShotNumber).toBe(0)
    expect(call.input.shots[0]).toMatchObject({ videoPrompt: "0-6s: He sprints down the wing and cuts inside.", aspectRatio: "9:16" })
  })
  it("refuses a shot with no image prompt", async () => {
    await expect(createOwnShots(context(), EPISODE, { shots: [{ title: "Empty" }] })).rejects.toThrow()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

const MINE = "user/project/chat/image-1.png"

describe("importOwnMedia", () => {
  it("fetches the link and stores it in the project as the user's upload", async () => {
    mocks.fetchMedia.mockResolvedValue({ bytes: Buffer.from([1, 2, 3]), contentType: "image/png", name: "shoe.png" })
    mocks.store.mockResolvedValue({ media: { path: MINE, type: "image", name: "shoe.png", size: 3 } })
    const result = await importOwnMedia(context(), EPISODE, { url: "https://cdn.example.com/shoe.png" })
    expect(mocks.fetchMedia).toHaveBeenCalledWith("https://cdn.example.com/shoe.png")
    const [, stored] = mocks.store.mock.calls[0]
    expect(stored).toMatchObject({ episodeId: EPISODE, name: "shoe.png", contentType: "image/png" })
    expect(stored.body.size).toBe(3)
    expect(result).toMatchObject({ path: MINE, type: "image", sizeBytes: 3 })
  })
})

describe("attachOwnMedia", () => {
  it("adds an image to a character's references", async () => {
    const result = await attachOwnMedia(context(), EPISODE, { path: MINE, entityId: ENTITY })
    const [, call, options] = mocks.request.mock.calls[0]
    expect(call).toMatchObject({ tool: "attach_media_to_asset", input: { assetId: ENTITY, storagePath: MINE } })
    expect(options).toEqual({ userAuthored: true })
    expect(result.attached).toBe(true)
  })

  it("sets a shot's frame, or its clip, on the shot the number names", async () => {
    await attachOwnMedia(context(), EPISODE, { path: MINE, shotNumber: 2 })
    expect(mocks.request.mock.calls[0][1]).toMatchObject({ tool: "attach_media_to_shot", input: { shotId: "shot-b", storagePath: MINE, mediaType: "image" } })
    await attachOwnMedia(context(), EPISODE, { path: "user/project/chat/video-1.mp4", shotNumber: 3, as: "video" })
    expect(mocks.request.mock.calls[1][1]).toMatchObject({ input: { shotId: "shot-c", mediaType: "video" } })
  })

  it("refuses a file from another account or project, and a path that climbs out", async () => {
    for (const path of ["someone-else/project/chat/image.png", "user/other-project/chat/image.png", "user/project/../../secret.png", "https://evil.example/a.png"]) {
      await expect(attachOwnMedia(context(), EPISODE, { path, entityId: ENTITY })).rejects.toThrow("not in this project")
    }
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("refuses the wrong kind of file for the place it is going", async () => {
    await expect(attachOwnMedia(context(), EPISODE, { path: "user/project/chat/video-1.mp4", entityId: ENTITY })).rejects.toThrow("takes an image")
    await expect(attachOwnMedia(context(), EPISODE, { path: MINE, shotNumber: 1, as: "video" })).rejects.toThrow("not a video")
    await expect(attachOwnMedia(context(), EPISODE, { path: "user/project/chat/video-1.mp4", shotNumber: 1 })).rejects.toThrow("not an image")
    await expect(attachOwnMedia(context(), EPISODE, { path: MINE })).rejects.toThrow()
    await expect(attachOwnMedia(context(), EPISODE, { path: MINE, entityId: ENTITY, shotNumber: 1 })).rejects.toThrow()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

describe("reference images on a render", () => {
  it("passes the user's own files as references and refuses anyone else's", async () => {
    await proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_image", shotNumbers: [1], referencePaths: [MINE] })
    expect(mocks.request.mock.calls[0][1].input.request.referencePaths).toEqual([MINE])
    await expect(proposeOwnGeneration(context(), EPISODE, { kind: "storyboard_image", shotNumbers: [1], referencePaths: ["stranger/project/a.png"] })).rejects.toThrow("not in this project")
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
})
