import { calculateCreditCost, creditRateFor, type CreditQuality } from "./credits"
import { getModelLabel } from "./generation-models"
import type { ScriptContent } from "./script"

/**
 * What a script will cost to produce, before a single shot exists.
 *
 * estimateProjectCost prices a storyboard that has already been built. A user
 * agreeing to a production has not got one yet, and quoting them nothing and
 * then spending thousands of credits is the worst version of this feature. So
 * the shot count is read out of the script itself and priced through the same
 * calculateCreditCost the generation routes bill with.
 */

/** A beat with no stated runtime is assumed to be about this long. */
export const defaultShotSeconds = 6
const minimumShots = 3
const maximumShots = 200

const TIMESTAMP_LINE = /^\s*(?:\**\s*)?(?:\d{1,2}:\d{2}|\d{1,3}\s*[-–—]\s*\d{1,3}\s*s(?:ec)?|\d{1,3}\s*s(?:ec)?\b|shot\s*\d+|scene\s*\d+|beat\s*\d+)/i

/**
 * How many shots a script becomes.
 *
 * Scenes are counted when the script has them, because that is the writer's own
 * division. Otherwise timed lines are counted — every script the writers here
 * produce is written in timed beats, and each beat becomes one shot. A script
 * with neither is estimated from its runtime rather than refused, because a
 * quote is more use than an error.
 */
export function estimateScriptShots(script: Pick<ScriptContent, "body" | "scenes">, runtimeSeconds?: number): number {
  const scenes = Array.isArray(script.scenes) ? script.scenes.filter((scene) => scene && (scene.heading || scene.direction)).length : 0
  if (scenes) return Math.min(maximumShots, Math.max(minimumShots, scenes))

  const timedLines = (script.body || "").split(/\r?\n/).filter((line) => TIMESTAMP_LINE.test(line)).length
  if (timedLines) return Math.min(maximumShots, Math.max(minimumShots, timedLines))

  if (runtimeSeconds && runtimeSeconds > 0) {
    return Math.min(maximumShots, Math.max(minimumShots, Math.ceil(runtimeSeconds / defaultShotSeconds)))
  }

  // A body with paragraphs but no timings still has a rough shape to it.
  const paragraphs = (script.body || "").split(/\n{2,}/).filter((block) => block.trim().length > 40).length
  return Math.min(maximumShots, Math.max(minimumShots, paragraphs || minimumShots))
}

export type ProductionEstimateInput = {
  shotCount: number
  secondsPerShot?: number
  imageModel: string
  assetCount?: number
  assetImageModel?: string
  videoModel: string
  resolution?: string
  imageQuality?: CreditQuality
  aspectRatio?: string
}

export type ProductionEstimate = {
  shotCount: number
  secondsPerShot: number
  totalSeconds: number
  imageModel: string
  imageModelLabel: string
  videoModel: string
  videoModelLabel: string
  resolution: string
  /** Credits for one keyframe. */
  imageUnit: number
  /** Credits for one shot's video. */
  videoUnit: number
  imageCredits: number
  assetCount: number
  assetImageModel: string
  assetImageModelLabel: string
  assetImageUnit: number
  assetImageCredits: number
  videoCredits: number
  totalCredits: number
}

export function estimateProductionCost(input: ProductionEstimateInput): ProductionEstimate {
  const shotCount = Math.min(maximumShots, Math.max(1, Math.round(input.shotCount)))
  const secondsPerShot = Math.max(1, Math.round(input.secondsPerShot || defaultShotSeconds))
  const resolution = input.resolution || "720p"
  const imageQuality = input.imageQuality || "Medium"

  const imageUnit = calculateCreditCost(input.imageModel, "image", 5, { quality: imageQuality, resolution, aspectRatio: input.aspectRatio })
  const assetCount = Math.max(0, Math.round(input.assetCount || 0))
  const assetImageModel = input.assetImageModel || input.imageModel
  const assetImageUnit = calculateCreditCost(assetImageModel, "image", 5, { quality: imageQuality, resolution, aspectRatio: "2:3" })
  const videoUnit = calculateCreditCost(input.videoModel, "video", secondsPerShot, { resolution, aspectRatio: input.aspectRatio })

  return {
    shotCount,
    secondsPerShot,
    totalSeconds: shotCount * secondsPerShot,
    imageModel: input.imageModel,
    imageModelLabel: getModelLabel(input.imageModel),
    videoModel: input.videoModel,
    videoModelLabel: getModelLabel(input.videoModel),
    resolution,
    imageUnit,
    videoUnit,
    imageCredits: imageUnit * shotCount,
    assetCount,
    assetImageModel,
    assetImageModelLabel: getModelLabel(assetImageModel),
    assetImageUnit,
    assetImageCredits: assetImageUnit * assetCount,
    videoCredits: videoUnit * shotCount,
    totalCredits: (imageUnit + videoUnit) * shotCount + assetImageUnit * assetCount,
  }
}

/**
 * The quote in words.
 *
 * Written out rather than left as a number because the user is being asked to
 * approve a spend: what it buys, at what quality, and what it costs, in one
 * sentence they can check.
 */
export function describeProductionEstimate(estimate: ProductionEstimate): string {
  const perSecond = creditRateFor(estimate.videoModel, "video").unit === "per second"
  return [
    `${estimate.shotCount} shots, about ${estimate.totalSeconds} seconds of finished video at ${estimate.resolution}.`,
    `Keyframes on ${estimate.imageModelLabel} at ${estimate.imageUnit} credits each — ${estimate.imageCredits} credits.`,
    ...(estimate.assetCount ? [`Reference art for ${estimate.assetCount} assets on ${estimate.assetImageModelLabel} — ${estimate.assetImageCredits} credits.`] : []),
    `Video on ${estimate.videoModelLabel} at ${estimate.videoUnit} credits per ${perSecond ? `${estimate.secondsPerShot}-second shot` : "shot"} — ${estimate.videoCredits} credits.`,
    `Total ${estimate.totalCredits} credits.`,
  ].join(" ")
}

/** What the user still has to buy, if anything. */
export function creditShortfall(totalCredits: number, balance: number): number {
  return Math.max(0, Math.ceil(totalCredits - Math.max(0, balance)))
}
