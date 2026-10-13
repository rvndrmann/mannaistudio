import { describe, expect, it } from "vitest"
import { jobRenderSettings } from "./job-render-settings"

describe("jobRenderSettings", () => {
  it("reads the length the studio page's video route stored, which is how a ten second clip became four", () => {
    const settings = jobRenderSettings({ settings: { duration: 10, displayRatio: "16:9", ratio: "adaptive", resolution: "720p", audioEnabled: true } })
    expect(settings.durationSeconds).toBe(10)
    expect(settings.aspectRatio).toBe("16:9")
    expect(settings).toMatchObject({ resolution: "720p", audioEnabled: true })
  })

  it("leaves a Director job's own settings as they are", () => {
    expect(jobRenderSettings({ settings: { durationSeconds: 12, aspectRatio: "9:16", duration: 4 } })).toMatchObject({ durationSeconds: 12, aspectRatio: "9:16" })
  })

  it("falls back to the recorded provider request", () => {
    expect(jobRenderSettings({ settings: {}, provider_request: { duration: 8, displayRatio: "1:1" } })).toMatchObject({ durationSeconds: 8, aspectRatio: "1:1" })
  })

  it("never treats adaptive as a shape, and invents nothing when no length was recorded", () => {
    const settings = jobRenderSettings({ settings: { ratio: "adaptive", duration: 0 } })
    expect(settings).not.toHaveProperty("aspectRatio")
    expect(settings).not.toHaveProperty("durationSeconds")
    expect(jobRenderSettings({})).toEqual({})
    expect(jobRenderSettings({ settings: "nonsense" })).toEqual({})
  })
})
