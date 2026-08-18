import { describe, expect, it } from "vitest"
import { directorTools } from "./tool-registry"

const shotId = "11111111-1111-4111-8111-111111111111"
const assetId = "22222222-2222-4222-8222-222222222222"

describe("update_shot accepts the patch however the model nested it", () => {
  it("takes the documented nested shape", () => {
    const parsed = directorTools.update_shot.input.parse({ shotId, patch: { prompt: "Rainy New York morning." } })
    expect(parsed).toEqual({ shotId, patch: { prompt: "Rainy New York morning." } })
  })

  it("takes the flattened shape a model produces instead", () => {
    // This came back as "patch: Invalid input" and silently dropped four shots
    // of a six-shot revision while the other two went through.
    const parsed = directorTools.update_shot.input.parse({ shotId, prompt: "Rainy New York morning." })
    expect(parsed).toEqual({ shotId, patch: { prompt: "Rainy New York morning." } })
  })

  it("lifts every field the patch understands", () => {
    const parsed = directorTools.update_shot.input.parse({
      shotId,
      title: "Shot 1 - Rainy New York Morning",
      prompt: "Wet brick facades.",
      video_prompt: "Slow push-in.",
      duration_seconds: 6,
    })
    expect(parsed).toEqual({
      shotId,
      patch: { title: "Shot 1 - Rainy New York Morning", prompt: "Wet brick facades.", video_prompt: "Slow push-in.", duration_seconds: 6 },
    })
  })

  it("keeps the image prompt and the video prompt apart when both are lifted", () => {
    const parsed = directorTools.update_shot.input.parse({ shotId, prompt: "Wide.", video_prompt: "Push in." }) as unknown as { patch: Record<string, string> }
    expect(parsed.patch.prompt).toBe("Wide.")
    expect(parsed.patch.video_prompt).toBe("Push in.")
  })

  it("still refuses a call with nothing to change", () => {
    expect(() => directorTools.update_shot.input.parse({ shotId })).toThrow()
  })

  it("still refuses a shot id that is not one", () => {
    expect(() => directorTools.update_shot.input.parse({ shotId: "shot 1", prompt: "x" })).toThrow()
  })
})

describe("update_asset accepts both shapes too", () => {
  it("takes the flattened description a revision produces", () => {
    const parsed = directorTools.update_asset.input.parse({ assetId, description: "Rainy New York street at morning." })
    expect(parsed).toEqual({ assetId, patch: { description: "Rainy New York street at morning." } })
  })

  it("leaves a correct nested call untouched", () => {
    const parsed = directorTools.update_asset.input.parse({ assetId, patch: { name: "Rainy New York Street" } })
    expect(parsed).toEqual({ assetId, patch: { name: "Rainy New York Street" } })
  })
})
