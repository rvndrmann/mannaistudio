import { describe, expect, it } from "vitest"
import { creditShortfall, describeProductionEstimate, estimateProductionCost, estimateScriptShots } from "./production-estimate"
import type { ScriptScene } from "./script"

const blankScript = { body: "", scenes: [] as ScriptScene[] }

describe("estimateScriptShots", () => {
  it("counts the writer's own scenes when the script has them", () => {
    const scenes = Array.from({ length: 7 }, (_, index) => ({ heading: `SCENE ${index}`, timing: "", direction: "Something happens", framing: "", continuity: "" }))
    expect(estimateScriptShots({ body: "", scenes })).toBe(7)
  })

  it("counts timed beats, because each beat becomes one shot", () => {
    const body = [
      "00:00 Kettle steams over an empty cup.",
      "00:04 Hands lift the bottle into frame.",
      "00:09 Pour, in close up.",
      "Some direction that is not a beat.",
      "00:14 Logo lands.",
    ].join("\n")
    expect(estimateScriptShots({ ...blankScript, body })).toBe(4)
  })

  it("reads the other beat formats writers actually use", () => {
    const body = ["0-5s The struggle", "5-15s The discovery", "15-30s The transformation"].join("\n")
    expect(estimateScriptShots({ ...blankScript, body })).toBe(3)
    expect(estimateScriptShots({ ...blankScript, body: "Shot 1 — open\nShot 2 — turn\nShot 3 — close\nShot 4 — logo" })).toBe(4)
  })

  it("falls back to the runtime rather than refusing to quote", () => {
    expect(estimateScriptShots(blankScript, 60)).toBe(10)
    expect(estimateScriptShots(blankScript, 30)).toBe(5)
  })

  it("never quotes fewer than three shots or more than two hundred", () => {
    expect(estimateScriptShots(blankScript)).toBe(3)
    expect(estimateScriptShots(blankScript, 6)).toBe(3)
    expect(estimateScriptShots({ ...blankScript, body: Array.from({ length: 400 }, (_, i) => `00:0${i % 10} beat`).join("\n") })).toBe(200)
  })
})

describe("estimateProductionCost", () => {
  const base = { shotCount: 10, secondsPerShot: 6, imageModel: "gpt-image-2", videoModel: "fal-seedance-2-0", resolution: "720p" as const }

  it("prices keyframes and video through the same rates the generation routes bill with", () => {
    const estimate = estimateProductionCost(base)
    // gpt-image-2 Medium is 12 credits; Seedance 2.0 at 720p is 32 a second.
    expect(estimate.imageUnit).toBe(12)
    expect(estimate.videoUnit).toBe(192)
    expect(estimate.imageCredits).toBe(120)
    expect(estimate.videoCredits).toBe(1_920)
    expect(estimate.totalCredits).toBe(2_040)
    expect(estimate.totalSeconds).toBe(60)
  })

  it("includes reference art for characters and assets", () => {
    const estimate = estimateProductionCost({ ...base, assetCount: 3, assetImageModel: "gpt-image-2" })
    expect(estimate.assetImageCredits).toBe(36)
    expect(estimate.totalCredits).toBe(2_076)
    expect(describeProductionEstimate(estimate)).toContain("Reference art for 3 assets")
  })

  it("follows resolution, because that is where the real money is", () => {
    const hd = estimateProductionCost({ ...base, resolution: "1080p" })
    const sd = estimateProductionCost({ ...base, resolution: "480p" })
    expect(hd.totalCredits).toBeGreaterThan(sd.totalCredits * 4)
  })

  it("charges a longer shot for the seconds it renders", () => {
    const short = estimateProductionCost({ ...base, secondsPerShot: 4 })
    const long = estimateProductionCost({ ...base, secondsPerShot: 8 })
    expect(long.videoCredits).toBe(short.videoCredits * 2)
  })

  it("keeps a nonsense shot count inside what can actually be produced", () => {
    expect(estimateProductionCost({ ...base, shotCount: 0 }).shotCount).toBe(1)
    expect(estimateProductionCost({ ...base, shotCount: 5_000 }).shotCount).toBe(200)
  })
})

describe("describeProductionEstimate", () => {
  it("says what is bought, at what rate, and what it totals", () => {
    const words = describeProductionEstimate(estimateProductionCost({ shotCount: 6, secondsPerShot: 5, imageModel: "gpt-image-2", videoModel: "fal-seedance-2-0", resolution: "720p" }))
    expect(words).toContain("6 shots")
    expect(words).toContain("30 seconds")
    expect(words).toContain("Total")
  })
})

describe("creditShortfall", () => {
  it("is what the user still has to buy", () => {
    expect(creditShortfall(2_040, 500)).toBe(1_540)
    expect(creditShortfall(2_040, 2_040)).toBe(0)
    expect(creditShortfall(2_040, 5_000)).toBe(0)
  })

  it("treats a negative balance as nothing, not as a discount", () => {
    expect(creditShortfall(100, -50)).toBe(100)
  })
})
