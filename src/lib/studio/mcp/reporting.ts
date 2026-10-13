import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { calculateCreditCost, creditRateFor } from "@/lib/studio/credits"
import { generationProvider, imageGenerationModels, isCharacterSheetImageModel, projectDirectorVideoModel, videoGenerationModels, videoModelMaxDuration } from "@/lib/studio/generation-models"
import { projectCharacterImageModel, projectStoryboardImageModel } from "@/lib/studio/project-image-model"
import { listCredentials } from "@/lib/byok/credential-service"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { byokProviderFor, byokProviders, providerSpecs, type ByokProvider } from "@/lib/byok/providers"
import { hasByokSubscription } from "@/lib/byok/credential-service"

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

const RECENT_FAILURE_MS = 24 * 60 * 60 * 1000

/**
 * The failures worth telling the user about now, newest first.
 *
 * A project keeps every job it ever ran, so a list of all failures re-reports
 * last week's on every call and buries the one that just happened. Only the
 * last day's are described; anything older is counted.
 */
export function failedJobs(jobs: unknown, now: number = Date.now()) {
  const failed = (Array.isArray(jobs) ? jobs as Job[] : []).filter((job) => job.status === "failed")
  const when = (job: Job) => Date.parse(String(job.completed_at || job.created_at || ""))
  const recent = failed.filter((job) => { const at = when(job); return Number.isNaN(at) || now - at <= RECENT_FAILURE_MS })
  return { recent: recent.map(describeJobFailure), olderCount: failed.length - recent.length }
}

/**
 * A job as an assistant needs it: what it is, where it stands, where the result is.
 *
 * The stored row carries the whole request — settings, routing, snapshots — at
 * several kilobytes a job. Thirty of those came to more than an assistant can
 * read in one tool result, so the answer to "is it done yet" could not be read
 * at all.
 */
function lengthNote(job: Job) {
  const verification = job.verification && typeof job.verification === "object" ? job.verification as Record<string, unknown> : {}
  const length = verification.length && typeof verification.length === "object" ? verification.length as Record<string, unknown> : {}
  return typeof length.note === "string" ? length.note : null
}

export function summarizeJob(job: Job) {
  const error = typeof job.error === "string" ? job.error.trim() : ""
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    model: job.model,
    ...(job.shot_id ? { shotId: job.shot_id } : {}),
    ...(job.entity_id ? { entityId: job.entity_id } : {}),
    ...(job.result_url ? { resultPath: job.result_url } : {}),
    ...(error ? { error: error.length > 300 ? `${error.slice(0, 300)}…` : error } : {}),
    // A clip that came back shorter than asked is not a failure, so it would
    // otherwise go unmentioned.
    ...(lengthNote(job) ? { note: lengthNote(job) } : {}),
    creditsUsed: job.credits_used ?? 0,
    createdAt: job.created_at ?? null,
    completedAt: job.completed_at ?? null,
  }
}

const keysPage = (origin: string) => `${origin}/studio/integrations`

/** What connecting a provider's key makes possible, in the user's terms. */
function unlockedBy(provider: ByokProvider) {
  const images = imageGenerationModels.filter((model) => byokProviderFor(generationProvider(model.id)) === provider).map((model) => model.label)
  const videos = videoGenerationModels.filter((model) => byokProviderFor(generationProvider(model.id)) === provider).map((model) => model.label)
  // The Director's own conversation runs on one of two providers, so those two
  // keys are also what the agent needs in order to speak at all.
  const chat = provider === "openai" || provider === "gemini"
  return { chatWithDirector: chat, imageModels: images, videoModels: videos }
}

/**
 * Which provider keys the account has, which it lacks, and what to do about it.
 *
 * A refusal that says "connect a key" is only useful if it also says which key,
 * what it is for, and where the two pages are: the provider's, to get one, and
 * the studio's, to paste it. This is that answer, available before anything is
 * attempted rather than as the reason something just failed.
 */
export async function describeKeys(userId: string, origin: string) {
  const [{ credentials, onlyOwnKeys, broken }, subscribed] = await Promise.all([
    accountBilling(userId),
    hasByokSubscription(userId).catch(() => false),
  ])
  const status = new Map(credentials.map((credential) => [credential.provider, credential.status]))
  const providers = byokProviders.map((provider) => {
    const state = status.get(provider) === "active" ? "connected" : status.get(provider) === "invalid" ? "invalid" : "missing"
    return { provider, name: providerSpecs[provider].label, status: state, getAKeyAt: providerSpecs[provider].helpUrl, unlocks: unlockedBy(provider) }
  })
  const missing = providers.filter((entry) => entry.status !== "connected")
  const canChat = providers.some((entry) => entry.status === "connected" && entry.unlocks.chatWithDirector)
  const actions: string[] = []
  if (onlyOwnKeys && !subscribed) actions.push("An active subscription is required before your own API keys can be used. Subscribe on the website first.")
  for (const provider of broken) actions.push(`Your ${providerSpecs[provider].label} key is marked invalid and is not being used. Replace it.`)
  if (onlyOwnKeys && !canChat) actions.push("The AI Director chat needs an OpenAI or Google Gemini key, and neither is connected. Until one is, work in own-prompts mode, which needs no chat key.")
  if (onlyOwnKeys && !providers.some((entry) => entry.status === "connected")) actions.push("No provider key is connected, so nothing can be generated yet. Connect at least one.")
  return {
    mode: onlyOwnKeys
      ? "own keys only: every generation runs on a provider key you connect and is billed by that provider; there are no studio credits, and a provider with no key is refused"
      : "studio credits, except on providers where you have connected your own key",
    subscriptionActive: subscribed,
    addKeysAt: keysPage(origin),
    providers,
    ...(onlyOwnKeys && missing.length ? { missing: missing.map((entry) => `${entry.name}: get a key at ${entry.getAKeyAt}, then add it at ${keysPage(origin)}`) } : {}),
    ...(actions.length ? { actionNeeded: actions } : {}),
  }
}

/** Whose account each model would run on, for this user, right now. */
async function accountBilling(userId: string) {
  const [credentials, onlyOwnKeys] = await Promise.all([
    listCredentials(userId).catch(() => []),
    ownKeysOnly(userId).catch(() => false),
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
  return { credentials, onlyOwnKeys, broken, runsOn }
}

/**
 * What a proposed render will cost and whose account pays, said before approval.
 *
 * The stored proposal carries no price: the studio page works it out beside the
 * approve button. An assistant has no page, so without this it was asking the
 * user to approve a generation at "0 credits" — or one that could not run at
 * all, because their only connected key belongs to a different provider.
 */
export async function estimateGeneration(context: AuthenticatedProjectContext, input: { type: "image" | "video"; model: string; count: number; durationSeconds?: number; resolution?: string }, origin = "") {
  const { runsOn, onlyOwnKeys } = await accountBilling(context.user.id)
  const perItem = calculateCreditCost(input.model, input.type, input.durationSeconds ?? 5, { resolution: input.resolution })
  const paidBy = runsOn(input.model)
  const count = Math.max(1, input.count)
  const provider = generationProvider(input.model as never)
  return {
    model: input.model,
    items: count,
    runsOn: paidBy,
    ...(paidBy === "your own key"
      ? { ...(onlyOwnKeys ? {} : { studioCredits: 0 }), note: `Billed by ${provider} to your own API key at their price. AI Director Hub adds no charge.` }
      : paidBy === "studio credits"
        ? { studioCredits: perItem * count, creditsPerItem: perItem, note: "Studio credits are reserved on approval and refunded if a job fails." }
        : { blocked: true, ...missingKey(provider, origin) }),
  }
}

/** The key a blocked render is waiting for, with both places the user has to go. */
function missingKey(generation: string, origin: string) {
  const provider = byokProviderFor(generation)
  const spec = provider ? providerSpecs[provider] : null
  const name = spec?.label || generation
  return {
    missingKey: { provider: provider || generation, name, getAKeyAt: spec?.helpUrl || null, addItAt: origin ? keysPage(origin) : "Creator Studio → API keys" },
    note: `This cannot run as it stands: approving it will fail. It needs your own ${name} API key${spec ? ` (get one at ${spec.helpUrl})` : ""}, added at ${origin ? keysPage(origin) : "Creator Studio → API keys"}. Or ask for a model that runs on a key you have connected (studio_list_models).`,
  }
}

/** Every model the account can ask for, what it costs, and whose key it would run on. */
export async function describeModels(context: AuthenticatedProjectContext, origin = "") {
  const { credentials, onlyOwnKeys, broken, runsOn } = await accountBilling(context.user.id)
  const usable = (model: string) => !runsOn(model).startsWith("unavailable")
  const image = imageGenerationModels.map((model) => ({
    id: model.id, label: model.label, provider: model.provider,
    // Credits mean something only to an account allowed to spend them. Shown
    // to anyone else they read as a price the studio charges, and it charges
    // nothing: the provider bills the user's own key.
    ...(onlyOwnKeys ? {} : { creditsPerImage: calculateCreditCost(model.id, "image") }),
    runsOn: runsOn(model.id),
    ...(isCharacterSheetImageModel(model.id) ? { note: "Always draws a character reference sheet; not for storyboard frames." } : {}),
  }))
  const video = videoGenerationModels.map((model) => ({
    id: model.id, label: model.label, provider: model.provider,
    ...(onlyOwnKeys ? {} : { creditsFor5Seconds: calculateCreditCost(model.id, "video", 5), pricedPer: creditRateFor(model.id, "video").unit }),
    maxSeconds: videoModelMaxDuration(model.id),
    runsOn: runsOn(model.id),
  }))
  // Grouped by the one thing that would unlock them, so the answer to "why
  // can't I use that one" is a single key rather than a list to cross-reference.
  const locked = byokProviders.flatMap((provider) => {
    const images = image.filter((model) => !usable(model.id) && byokProviderFor(model.provider) === provider)
    const videos = video.filter((model) => !usable(model.id) && byokProviderFor(model.provider) === provider)
    if (!images.length && !videos.length) return []
    return [{
      needsKeyFrom: providerSpecs[provider].label,
      getAKeyAt: providerSpecs[provider].helpUrl,
      addItAt: origin ? keysPage(origin) : "Creator Studio → API keys",
      imageModels: images.map((model) => ({ id: model.id, label: model.label })),
      videoModels: videos.map((model) => ({ id: model.id, label: model.label })),
    }]
  })
  const defaults = {
    storyboardImageModel: projectStoryboardImageModel(context.project),
    characterImageModel: projectCharacterImageModel(context.project),
    videoModel: projectDirectorVideoModel(context.project),
  }
  const unusableDefaults = Object.entries(defaults).filter(([, model]) => !usable(model)).map(([setting, model]) => `${setting} (${model})`)
  return {
    // What can be asked for right now, first: this is the list to offer.
    availableNow: { imageModels: image.filter((model) => usable(model.id)), videoModels: video.filter((model) => usable(model.id)) },
    ...(locked.length ? { lockedUntilAKeyIsAdded: locked } : {}),
    projectDefaults: defaults,
    // A project default the account cannot run fails every render that does
    // not name a model, which is every render the user did not think about.
    ...(unusableDefaults.length ? { warning: `This project's default models cannot run on your connected keys: ${unusableDefaults.join(", ")}. Name a model from availableNow when generating, or connect the key they need.` } : {}),
    billing: {
      ownKeysOnly: onlyOwnKeys,
      connectedKeys: credentials.map((credential) => ({ provider: credential.provider, status: credential.status, lastUsedAt: credential.lastUsedAt })),
      ...(broken.length ? { keyProblems: broken.map((provider) => `Your ${provider} API key is marked invalid and is not being used. Replace it at Creator Studio → API keys.`) } : {}),
    },
    note: onlyOwnKeys
      ? "Pass a model's id as model when generating, or make it the project's default with studio_set_project_models. Every generation is billed by the provider to the user's own API key at the provider's price; AI Director Hub adds no charge and uses no credits."
      : "Pass a model's id as model when generating, or make it the project's default with studio_set_project_models. Credit figures are the studio price at default quality and resolution; a proposal shows the exact cost before anything is charged. A model that runs on your own key takes no studio credits.",
  }
}
