import { describe, expect, it } from "vitest"
import { calculateCreditCost } from "./credits"
import {
  estimateProjectCost,
  projectCostSettings,
  summarizeProjectSpend,
  type ShotCostInput,
} from "./cost-estimate"

/**
 * The storyboard quoted ten credits a shot whatever the models and settings
 * were, and never showed what had actually been spent. These cover both: the
 * estimate has to agree with what the generation routes bill, and the spend has
 * to net out the refunds a failed generation returns.
 */

const shot = (over: Partial<ShotCostInput> = {}): ShotCostInput => ({
  keyframe_image: null,
  video_url: null,
  video_status: "none",
  duration_seconds: 4,
  prompt: "",
  ...over,
})

const settings = projectCostSettings({
  default_aspect: "16:9",
  metadata: {
    basic_settings: {
      storyboardImageModel: "gpt-image-2",
      videoModel: "dreamina-seedance-2-5-260628",
      imageQuality: "High",
      resolution: "1080p",
      aspectRatio: "16:9",
    },
  },
})

describe("projectCostSettings", () => {
  it("reads the models, quality and resolution out of Basic Settings", () => {
    expect(settings).toEqual({
      imageModel: "gpt-image-2",
      videoModel: "dreamina-seedance-2-5-260628",
      imageQuality: "High",
      resolution: "1080p",
      aspectRatio: "16:9",
    })
  })

  it("falls back to defaults for a project that never opened the dialog", () => {
    const fallback = projectCostSettings({ default_aspect: "9:16" })
    expect(fallback.imageQuality).toBe("Medium")
    expect(fallback.resolution).toBe("720p")
    expect(fallback.aspectRatio).toBe("9:16")
    expect(fallback.imageModel).toBeTruthy()
    expect(fallback.videoModel).toBeTruthy()
  })
})

describe("estimateProjectCost", () => {
  it("prices every shot with the same arithmetic the generation routes bill", () => {
    const shots = [shot(), shot(), shot()]
    const estimate = estimateProjectCost(shots, settings)

    const perImage = calculateCreditCost("gpt-image-2", "image", 5, { quality: "High", aspectRatio: "16:9" })
    const perShotVideo = calculateCreditCost("dreamina-seedance-2-5-260628", "video", 4, { aspectRatio: "16:9", resolution: "1080p" })

    expect(estimate.shotCount).toBe(3)
    expect(estimate.image.credits).toBe(perImage * 3)
    expect(estimate.video.credits).toBe(perShotVideo * 3)
    expect(estimate.totalCredits).toBe(perImage * 3 + perShotVideo * 3)
    // Ten credits a shot was never anywhere near the real figure.
    expect(estimate.totalCredits).toBeGreaterThan(3 * 10)
  })

  it("bills a per-second model for every second of a long shot", () => {
    const short = estimateProjectCost([shot({ duration_seconds: 5 })], settings)
    const long = estimateProjectCost([shot({ duration_seconds: 10 })], settings)
    expect(long.video.totalSeconds).toBe(10)
    expect(long.video.credits).toBe(short.video.credits * 2)
    expect(long.video.unit).toBe("per second")
  })

  it("sizes a shot left on the default duration from its own dialogue", () => {
    const wordy = shot({ duration_seconds: 4, prompt: '@Lena says: {"You were never going to tell me any of this, were you, not once."}' })
    const estimate = estimateProjectCost([wordy], settings)
    expect(estimate.video.totalSeconds).toBeGreaterThan(4)
  })

  it("charges nothing again for work that is already on the shot", () => {
    const shots = [
      shot({ keyframe_image: "a.png", video_url: "a.mp4", video_status: "completed" }),
      shot({ keyframe_image: "b.png" }),
      shot(),
    ]
    const estimate = estimateProjectCost(shots, settings)

    expect(estimate.image.pendingShots).toBe(1)
    expect(estimate.image.completedShots).toBe(2)
    expect(estimate.video.pendingShots).toBe(2)
    expect(estimate.remainingCredits).toBeLessThan(estimate.totalCredits)
  })

  it("still charges a shot whose render failed", () => {
    const failed = estimateProjectCost([shot({ video_url: "a.mp4", video_status: "failed" })], settings)
    expect(failed.video.pendingShots).toBe(1)
    expect(failed.video.credits).toBeGreaterThan(0)
  })

  it("quotes a per-video model as a five-second clip", () => {
    const perVideo = projectCostSettings({
      metadata: { basic_settings: { videoModel: "fal-seedance-2-0-fast", storyboardImageModel: "gpt-image-2" } },
    })
    const estimate = estimateProjectCost([shot()], perVideo)
    expect(estimate.video.unit).toBe("per 5s clip")
    expect(estimate.video.unitCredits).toBe(calculateCreditCost("fal-seedance-2-0-fast", "video", 5, { aspectRatio: "9:16", resolution: "720p" }))
  })

  it("is zero for an empty storyboard", () => {
    const estimate = estimateProjectCost([], settings)
    expect(estimate.totalCredits).toBe(0)
    expect(estimate.remainingCredits).toBe(0)
    expect(estimate.video.totalSeconds).toBe(0)
  })
})

describe("summarizeProjectSpend", () => {
  it("nets the refund off a failed generation", () => {
    const spend = summarizeProjectSpend([
      { type: "image", status: "completed", credits_used: 20 },
      { type: "video", status: "completed", credits_used: 300 },
      { type: "video", status: "failed", credits_used: 300, credits_refunded: 300 },
    ])
    expect(spend.charged).toBe(620)
    expect(spend.refunded).toBe(300)
    expect(spend.net).toBe(320)
    expect(spend.failedJobs).toBe(1)
    expect(spend.awaitingRefund).toBe(0)
  })

  it("flags a failed job whose credits were never returned", () => {
    const spend = summarizeProjectSpend([
      { type: "video", status: "failed", credits_used: 150 },
    ])
    expect(spend.net).toBe(150)
    expect(spend.awaitingRefund).toBe(1)
    expect(spend.awaitingRefundCredits).toBe(150)
  })

  it("counts a job still in flight at the credits it reserved", () => {
    const spend = summarizeProjectSpend([
      { type: "video", status: "processing", estimated_credits: 250, credits_used: 0 },
    ])
    expect(spend.charged).toBe(250)
    expect(spend.net).toBe(250)
  })

  it("splits image and video spend", () => {
    const spend = summarizeProjectSpend([
      { type: "image", status: "completed", credits_used: 20 },
      { type: "image", status: "failed", credits_used: 20, credits_refunded: 20 },
      { type: "video", status: "completed", credits_used: 500 },
    ])
    expect(spend.image).toEqual({ jobs: 2, charged: 40, refunded: 20, net: 20 })
    expect(spend.video).toEqual({ jobs: 1, charged: 500, refunded: 0, net: 500 })
  })

  it("never refunds more than was charged", () => {
    const spend = summarizeProjectSpend([{ type: "video", status: "failed", credits_used: 100, credits_refunded: 400 }])
    expect(spend.refunded).toBe(100)
    expect(spend.net).toBe(0)
  })

  it("is zero for a project that has generated nothing", () => {
    expect(summarizeProjectSpend([]).net).toBe(0)
  })
})
