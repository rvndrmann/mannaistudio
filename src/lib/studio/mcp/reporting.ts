import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { calculateCreditCost, creditRateFor } from "@/lib/studio/credits"
import { generationProvider, imageGenerationModels, isCharacterSheetImageModel, projectDirectorVideoModel, videoGenerationModels, videoModelMaxDuration } from "@/lib/studio/generation-models"
import { projectCharacterImageModel, projectStoryboardImageModel } from "@/lib/studio/project-image-model"
import { listCredentials } from "@/lib/byok/credential-service"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { byokProviderFor } from "@/lib/byok/providers"

/**
 * What an assistant needs in order to answer "which model?" and "what went
 * wrong?" without sending the user to the website to look.
 */

type Job = Record<string, unknown>

const keyProblem = /\b(401|403|unauthori[sz]ed|forbidden|invalid[\s_-]*(api[\s_-]*)?key|api[\s_-]*key|credential|authenticat|permission|quota|insufficient|billing|balance|not configured|no longer connected)\b/i

/**
 * A failed job, said in a way the user can act on.
 *
 * The stored error is the provider's own words, which is the useful part and is
 * kept. What it never says is whose account the job ran on — and that decides
 * whether the fix is the user's key or ours.
 */
export function describeJobFailure(job: Job) {
  const provider = typeof job.provider === "string" ? job.provider : ""
  const ownKey = job.billing_mode === "byok"
  const error = typeof job.error === "string" && job.error.trim() ? job.error.trim() : "The provider reported a failure without a reason."
  const advice = ownKey
    ? keyProblem.test(error)
      ? `This ran on your own ${provider} API key, and the error points at the key or the account behind it. Check or replace the key at Creator Studio → API keys, and confirm the provider account has funds.`
      : `This ran on your own ${provider} API key, so no studio credits were taken.`
    : keyProblem.test(error)
      ? "This ran on studio credits, so the problem is on the studio's side rather than a key of yours. Credits taken for a failed job are refunded."
      : "This ran on studio credits. Credits taken for a failed job are refunded."
  return {
    jobId: job.id,
    type: job.type,
    model: job.model,
    provider,
    target: job.shot_id ? { shotId: job.shot_id } : job.entity_id ? { entityId: job.entity_id } : null,
    ranOn: ownKey ? `your own ${provider} key` : "studio credits",
    error,
    advice,
    creditsRefunded: job.credits_refunded ?? 0,
    failedAt: job.completed_at ?? job.created_at ?? null,
  }
}

/** The failed jobs among those the workspace returned, newest first. */
export function failedJobs(jobs: unknown) {
  return (Array.isArray(jobs) ? jobs as Job[] : []).filter((job) => job.status === "failed").map(describeJobFailure)
}

/** Every model the account can ask for, what it costs, and whose key it would run on. */
export async function describeModels(context: AuthenticatedProjectContext) {
  const [credentials, onlyOwnKeys] = await Promise.all([
    listCredentials(context.user.id).catch(() => []),
    ownKeysOnly(context.user.id).catch(() => false),
  ])
  // Only an active key is used. One marked invalid is still listed, so it is
  // reported as a problem rather than counted as something a job would run on.
  const connected = new Set(credentials.filter((credential) => credential.status === "active").map((credential) => credential.provider))
  const broken = credentials.filter((credential) => credential.status === "invalid").map((credential) => credential.provider)
  const runsOn = (model: string) => {
    const provider = byokProviderFor(generationProvider(model as never))
    if (provider && connected.has(provider)) return "your own key"
    return onlyOwnKeys ? "unavailable: your account uses only your own keys and none is connected for this provider" : "studio credits"
  }
  return {
    projectDefaults: {
      storyboardImageModel: projectStoryboardImageModel(context.project),
      characterImageModel: projectCharacterImageModel(context.project),
      videoModel: projectDirectorVideoModel(context.project),
    },
    billing: {
      ownKeysOnly: onlyOwnKeys,
      connectedKeys: credentials.map((credential) => ({ provider: credential.provider, status: credential.status, lastUsedAt: credential.lastUsedAt })),
      ...(broken.length ? { keyProblems: broken.map((provider) => `Your ${provider} API key is marked invalid and is not being used. Replace it at Creator Studio → API keys.`) } : {}),
    },
    imageModels: imageGenerationModels.map((model) => ({
      id: model.id, label: model.label, provider: model.provider,
      creditsPerImage: calculateCreditCost(model.id, "image"),
      runsOn: runsOn(model.id),
      ...(isCharacterSheetImageModel(model.id) ? { note: "Always draws a character reference sheet; not for storyboard frames." } : {}),
    })),
    videoModels: videoGenerationModels.map((model) => ({
      id: model.id, label: model.label, provider: model.provider,
      creditsFor5Seconds: calculateCreditCost(model.id, "video", 5),
      pricedPer: creditRateFor(model.id, "video").unit,
      maxSeconds: videoModelMaxDuration(model.id),
      runsOn: runsOn(model.id),
    })),
    note: "Credit figures are the studio price at default quality and resolution; a proposal shows the exact cost before anything is charged. A model that runs on your own key takes no studio credits.",
  }
}
