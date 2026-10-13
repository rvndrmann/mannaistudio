import { describe, expect, it, vi } from "vitest"
import { setProjectModels } from "./project-models"

function context(metadata: unknown, writeError: unknown = null) {
  const update = vi.fn(() => ({ eq: async () => ({ error: writeError }) }))
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { metadata }, error: null }) }) }),
    update,
  }))
  return { update, value: { supabase: { from }, project: { id: "project" }, user: { id: "user" } } as never }
}

describe("setProjectModels", () => {
  it("changes only the models named and leaves every other setting as it was", async () => {
    const { update, value } = context({ default_workflow_id: "keep", basic_settings: { aspectRatio: "16:9", visualStyle: "Noir", videoModel: "fal-kling-3", storyboardImageModel: "gpt-image-2" } })
    const result = await setProjectModels(value, { videoModel: "higgsfield/kling-video/o3/image-reference", characterImageModel: "higgsfield-ai/soul/v2/standard" })
    expect(update).toHaveBeenCalledWith({ metadata: {
      default_workflow_id: "keep",
      basic_settings: { aspectRatio: "16:9", visualStyle: "Noir", storyboardImageModel: "gpt-image-2", videoModel: "higgsfield/kling-video/o3/image-reference", characterImageModel: "higgsfield-ai/soul/v2/standard" },
    } })
    expect(result.saved.videoModel).toEqual({ id: "higgsfield/kling-video/o3/image-reference", label: "Kling O3 (Higgsfield)" })
  })

  it("works on a project that has no settings saved yet", async () => {
    const { update, value } = context(null)
    await setProjectModels(value, { storyboardImageModel: "fal-flux-3" })
    expect(update).toHaveBeenCalledWith({ metadata: { basic_settings: { storyboardImageModel: "fal-flux-3" } } })
  })

  it("refuses a model that is not offered, the wrong kind, or a sheet-only model as a default", async () => {
    const { update, value } = context({})
    await expect(setProjectModels(value, { videoModel: "made-up" })).rejects.toThrow()
    await expect(setProjectModels(value, { storyboardImageModel: "fal-kling-3" })).rejects.toThrow()
    await expect(setProjectModels(value, { storyboardImageModel: "higgsfield/ai-influencer" })).rejects.toThrow()
    await expect(setProjectModels(value, {})).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it("surfaces a failed save", async () => {
    const { value } = context({}, new Error("denied"))
    await expect(setProjectModels(value, { videoModel: "fal-kling-3" })).rejects.toThrow("denied")
  })
})
