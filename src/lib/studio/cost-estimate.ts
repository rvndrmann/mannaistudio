import { calculateCreditCost, MODEL_CREDIT_COSTS } from "./credits"
import { getModelLabel, imageGenerationModels, supportedVideoModel } from "./generation-models"
import { resolveShotSeconds } from "./shot-duration"

/**
 * What an episode costs, before and after it is rendered.
 *
 * The storyboard quoted `shots.length * 10` — a number no model charges and no
 * setting changes — so a 12-shot episode on Seedance 2.5 at 1080p read as 120
 * credits and billed several thousand. An estimate is only worth showing if it
 * is the same arithmetic the generation routes bill with, which is why both
 * sides of this file price through `calculateCreditCost` and read the models
 * and quality out of the project's own Basic Settings.
 */

export type ProjectCostSettings = {
  imageModel: string
  videoModel: string
  imageQuality: "Low" | "Medium" | "High" | "Ultra"
  resolution: string
  aspectRatio: string
}

export type ShotCostInput = {
  keyframe_image?: string | null
  video_url?: string | null
  video_status?: string | null
  duration_seconds?: number | null
  prompt?: string | null
  aspect_ratio?: string | null
  resolution?: string | null
}

export type CostLeg = {
  /** Model id billed for this leg. */
  model: string
  /** Human label, as shown in Basic Settings. */
  label: string
  /** Credits for one unit at the project's settings — one image, or one second. */
  unitCredits: number
  /** What that unit is, for the caption: "per image" or "per second". */
  unit: string
  /** Shots this leg still has to produce. */
  pendingShots: number
  /** Shots already produced, so already paid for. */
  completedShots: number
  /** Credits to finish the pending shots. */
  credits: number
  /** Credits the whole episode would cost from scratch. */
  creditsAllShots: number
}

export type VideoCostLeg = CostLeg & {
  /** Runtime still to render, in seconds. */
  pendingSeconds: number
  /** Runtime of every shot in the episode, in seconds. */
  totalSeconds: number
}

export type ProjectCostEstimate = {
  shotCount: number
  settings: ProjectCostSettings
  image: CostLeg
  video: VideoCostLeg
  /** Credits to finish what is left. This is the headline number. */
  remainingCredits: number
  /** Credits for the whole episode from an empty storyboard. */
  totalCredits: number
}

const QUALITIES = ["Low", "Medium", "High", "Ultra"] as const

function readSettings(project: Record<string, unknown>): ProjectCostSettings {
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basic = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "")
  const quality = QUALITIES.find((option) => option.toLowerCase() === text(basic.imageQuality).toLowerCase())
  return {
    // The storyboard's keyframes are what a shot is priced on, so the
    // storyboard model is the one quoted — not the character-art model.
    imageModel: text(basic.storyboardImageModel) || imageGenerationModels[0].id,
    // A model since retired is still saved on old projects, and pricing it at
    // the flat fallback would quote a rate nothing will actually bill.
    videoModel: supportedVideoModel(text(basic.videoModel)),
    imageQuality: quality || "Medium",
    resolution: text(basic.resolution) || "720p",
    aspectRatio: text(basic.aspectRatio) || text(project.default_aspect) || "9:16",
  }
}

/** The models, quality, and resolution this project generates at. */
export function projectCostSettings(project: Record<string, unknown> | null | undefined): ProjectCostSettings {
  return readSettings(project && typeof project === "object" ? project : {})
}

/** A shot has been paid for on the image side once it has a keyframe. */
export function shotHasImage(shot: ShotCostInput) {
  return Boolean(shot.keyframe_image)
}

/** …and on the video side once a render came back. */
export function shotHasVideo(shot: ShotCostInput) {
  return Boolean(shot.video_url) && shot.video_status !== "failed"
}

export function estimateProjectCost(shots: ShotCostInput[], settings: ProjectCostSettings): ProjectCostEstimate {
  const videoConfig = MODEL_CREDIT_COSTS[settings.videoModel]
  const perSecond = videoConfig?.unit === "per second"

  let imageCredits = 0
  let imageCreditsAll = 0
  let imagePending = 0
  let videoCredits = 0
  let videoCreditsAll = 0
  let videoPending = 0
  let pendingSeconds = 0
  let totalSeconds = 0

  for (const shot of shots) {
    const aspectRatio = shot.aspect_ratio?.trim() || settings.aspectRatio
    const resolution = shot.resolution?.trim() || settings.resolution
    // A shot runs as long as its own content asks for, which is what it is
    // rendered at and therefore what it is billed at.
    const seconds = resolveShotSeconds(shot, settings.videoModel)

    const shotImage = calculateCreditCost(settings.imageModel, "image", 5, { quality: settings.imageQuality, aspectRatio })
    // Image quality is an image setting; video is priced on resolution and
    // runtime, so passing the image quality here would double-charge it.
    const shotVideo = calculateCreditCost(settings.videoModel, "video", seconds, { aspectRatio, resolution })

    imageCreditsAll += shotImage
    videoCreditsAll += shotVideo
    totalSeconds += seconds

    if (!shotHasImage(shot)) {
      imageCredits += shotImage
      imagePending += 1
    }
    if (!shotHasVideo(shot)) {
      videoCredits += shotVideo
      videoPending += 1
      pendingSeconds += seconds
    }
  }

  const shotCount = shots.length
  return {
    shotCount,
    settings,
    image: {
      model: settings.imageModel,
      label: getModelLabel(settings.imageModel),
      unitCredits: calculateCreditCost(settings.imageModel, "image", 5, { quality: settings.imageQuality, aspectRatio: settings.aspectRatio }),
      unit: "per image",
      pendingShots: imagePending,
      completedShots: shotCount - imagePending,
      credits: imageCredits,
      creditsAllShots: imageCreditsAll,
    },
    video: {
      model: settings.videoModel,
      label: getModelLabel(settings.videoModel),
      // Per-second models quote a second; per-video models quote their
      // five-second clip, so the caption has to say which is being shown.
      unitCredits: perSecond
        ? calculateCreditCost(settings.videoModel, "video", 1, { aspectRatio: settings.aspectRatio, resolution: settings.resolution })
        : calculateCreditCost(settings.videoModel, "video", 5, { aspectRatio: settings.aspectRatio, resolution: settings.resolution }),
      unit: perSecond ? "per second" : "per 5s clip",
      pendingShots: videoPending,
      completedShots: shotCount - videoPending,
      credits: videoCredits,
      creditsAllShots: videoCreditsAll,
      pendingSeconds,
      totalSeconds,
    },
    remainingCredits: imageCredits + videoCredits,
    totalCredits: imageCreditsAll + videoCreditsAll,
  }
}

export type SpendJob = {
  type?: string | null
  status?: string | null
  estimated_credits?: number | null
  credits_used?: number | null
  credits_refunded?: number | null
}

export type SpendLeg = {
  jobs: number
  charged: number
  refunded: number
  net: number
}

export type ProjectSpend = {
  jobs: number
  /** Everything ever deducted for this project. */
  charged: number
  /** Everything given back for a generation that failed or was cancelled. */
  refunded: number
  /** What the project actually cost: charged minus refunded. */
  net: number
  image: SpendLeg
  video: SpendLeg
  failedJobs: number
  /** Failed or cancelled jobs still holding credits no refund has returned. */
  awaitingRefund: number
  awaitingRefundCredits: number
}

const FAILED = new Set(["failed", "cancelled"])

function chargeOf(job: SpendJob) {
  // credits_used is written when the provider settles. Until then the reserved
  // estimate is the money that actually left the balance.
  const used = Number(job.credits_used || 0)
  const charge = used > 0 ? used : Number(job.estimated_credits || 0)
  return Number.isFinite(charge) && charge > 0 ? charge : 0
}

function refundOf(job: SpendJob) {
  const refunded = Number(job.credits_refunded || 0)
  if (!Number.isFinite(refunded) || refunded <= 0) return 0
  // A refund never exceeds the charge, whatever a legacy reconciliation wrote.
  return Math.min(refunded, chargeOf(job))
}

/** What this project has really spent, net of refunds for failed generations. */
export function summarizeProjectSpend(jobs: SpendJob[]): ProjectSpend {
  const leg = (): SpendLeg => ({ jobs: 0, charged: 0, refunded: 0, net: 0 })
  const image = leg()
  const video = leg()
  let failedJobs = 0
  let awaitingRefund = 0
  let awaitingRefundCredits = 0

  for (const job of jobs) {
    const charged = chargeOf(job)
    const refunded = refundOf(job)
    const target = job.type === "video" ? video : image
    target.jobs += 1
    target.charged += charged
    target.refunded += refunded
    target.net += charged - refunded

    if (FAILED.has(String(job.status || ""))) {
      failedJobs += 1
      // A failed job that kept its credits is money the user is owed; the
      // bar has to show it rather than quietly counting it as spend.
      if (charged - refunded > 0) {
        awaitingRefund += 1
        awaitingRefundCredits += charged - refunded
      }
    }
  }

  return {
    jobs: jobs.length,
    charged: image.charged + video.charged,
    refunded: image.refunded + video.refunded,
    net: image.net + video.net,
    image,
    video,
    failedJobs,
    awaitingRefund,
    awaitingRefundCredits,
  }
}

/** Credits are sold at a flat rate, so a number of them is a number of dollars. */
export function creditsToUsd(credits: number) {
  return credits / 100
}
