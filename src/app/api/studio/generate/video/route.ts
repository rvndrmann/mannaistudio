import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import {
  BytePlusProviderError,
  bytePlusVideoRatio,
  bytePlusVideoReferenceLimit,
  getBytePlusVideoTask,
  submitBytePlusVideo,
} from "@/lib/studio/byteplus"
import { FalProviderError, getFalVideoTask, submitFalVideo } from "@/lib/studio/fal"
import { getGoogleVideoTask, GoogleProviderError, submitGoogleVideo } from "@/lib/studio/google"
import { generationProvider, isVideoGenerationModel, videoModelMaxDuration } from "@/lib/studio/generation-models"
import { byokProviderFor } from "@/lib/byok/providers"
import { decideBilling, refundableCredits } from "@/lib/byok/billing"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { trackGenerationActivation } from "@/lib/studio/activation"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import {
  composeQuickPrompt,
  foreignReferences,
  MEDIA_BUCKET,
  quickStoragePath,
  requireAuthenticatedUser,
  signReferenceUrls,
  type QuickContext,
} from "@/lib/studio/quick-generation"

/**
 * A video, with no production attached.
 *
 * Same two halves as the storyboard route: POST reserves the money and hands
 * the request to the provider, GET polls until there is a file and stores it.
 * What is gone is everything that made the clip part of a story — the shot it
 * attaches to, the cast it must keep consistent, the previous clip it continues
 * from. A standalone clip has a prompt, some reference frames, and a length.
 */

const submitSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  model: z.string().refine(isVideoGenerationModel, "Unsupported video model"),
  referenceImages: z.array(z.string().max(2_000)).max(10).default([]),
  referenceVideos: z.array(z.string().max(2_000)).max(4).default([]),
  startFrame: z.string().max(2_000).nullable().optional(),
  endFrame: z.string().max(2_000).nullable().optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"]).default("16:9"),
  resolution: z.enum(["480p", "720p", "1080p", "4K"]).default("720p"),
  quality: z.enum(["Low", "Medium", "High", "Ultra"]).default("Medium"),
  audioEnabled: z.boolean().default(true),
  durationSeconds: z.number().int().min(3).max(30).default(5),
}).strict()

export async function POST(request: NextRequest) {
  let pendingRefund: { amount: number; key: string } | null = null
  let openContext: QuickContext | null = null
  try {
    const context = await requireAuthenticatedUser()
    openContext = context
    const input = submitSchema.parse(await request.json())
    const provider = generationProvider(input.model)

    // The start frame leads the reference list — for a keyframe model it *is*
    // the first frame — and the end frame is passed separately, so neither is
    // duplicated into the general references below.
    const imageReferences = Array.from(new Set([
      ...(input.startFrame ? [input.startFrame] : []),
      ...input.referenceImages,
    ])).filter((path) => path !== input.endFrame)

    const everyReference = [...imageReferences, ...input.referenceVideos, ...(input.endFrame ? [input.endFrame] : [])]
    const foreign = foreignReferences(context.user.id, everyReference)
    if (foreign.length) return NextResponse.json({ error: "One or more reference files do not belong to you." }, { status: 403 })

    // Asking for more seconds than a model renders does not fail — the provider
    // silently truncates — so the cap is applied before the clip is priced, or
    // the user pays for seconds they never receive.
    const durationSeconds = Math.min(input.durationSeconds, videoModelMaxDuration(input.model))

    const platformCost = calculateCreditCost(input.model, "video", durationSeconds, {
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
    })
    const byokProvider = byokProviderFor(provider)
    const billing = decideBilling({
      hasCredential: byokProvider ? await hasCredential(context.user.id, byokProvider) : false,
      platformCredits: platformCost,
      ownKeysOnly: await ownKeysOnly(context.user.id).catch(() => false),
      provider: byokProvider || provider,
    })
    const creditCost = billing.credits
    let creditBalanceAfter: number | null = null
    if (billing.mode !== "byok") {
      const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Video Generation (${input.model})`, context.supabase)
      if (!deduct.success) {
        return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
      }
      creditBalanceAfter = deduct.newBalance
      // Only a charge can be refunded; a BYOK failure is the provider's bill.
      pendingRefund = { amount: creditCost, key: `video-quick:${randomUUID()}` }
    }

    const resolvedPrompt = composeQuickPrompt(input.prompt, input.aspectRatio)
    const references = await signReferenceUrls(context, imageReferences)
    const videoLimit = bytePlusVideoReferenceLimit(input.model)
    const videoReferences = await signReferenceUrls(context, input.referenceVideos.slice(0, videoLimit.maxVideos))
    const endFrameUrl = input.endFrame ? (await signReferenceUrls(context, [input.endFrame]))[0] : null
    const providerRatio = provider === "byteplus" ? bytePlusVideoRatio(input.aspectRatio, videoReferences.length > 0) : input.aspectRatio

    const providerRequest = {
      surface: "quick",
      prompt: resolvedPrompt,
      basePrompt: input.prompt,
      duration: durationSeconds,
      resolution: input.resolution,
      ratio: providerRatio,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      referenceImages: imageReferences,
      referenceVideos: input.referenceVideos,
      startFrame: input.startFrame || null,
      endFrame: input.endFrame || null,
      audioEnabled: input.audioEnabled,
    }

    const { data: job, error: jobError } = await context.supabase
      .from("creator_generation_jobs")
      .insert({
        user_id: context.user.id,
        project_id: null,
        type: "video",
        status: "approved",
        provider,
        model: input.model,
        prompt: input.prompt,
        input_images: [...imageReferences, ...input.referenceVideos],
        settings: providerRequest,
        provider_request: providerRequest,
        requires_approval: false,
        approved_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        idempotency_key: randomUUID(),
        operation: "submit_quick_video",
        estimated_credits: creditCost,
        billing_mode: billing.mode,
        credits_used: 0,
      })
      .select("id")
      .single()
    if (jobError) throw jobError
    if (pendingRefund) pendingRefund.key = `generation-job:${job.id}`

    /** Submits on whichever account is paying for this clip. */
    const runOnBillingAccount = async <T,>(work: () => Promise<T>): Promise<T> => {
      if (billing.mode !== "byok" || !byokProvider) return work()
      const ran = await withCredential({ userId: context.user.id, provider: byokProvider }, (parts) =>
        runWithCredential(byokProvider, parts, work))
      if (ran === null) throw new Error("The provider key for this model is no longer connected.")
      return ran
    }

    try {
      const task = await runOnBillingAccount(async (): Promise<{ id: string; response?: unknown }> => {
        if (provider === "fal") {
          const falRes = await submitFalVideo({
            model: input.model,
            prompt: resolvedPrompt,
            duration: durationSeconds,
            resolution: input.resolution,
            ratio: input.aspectRatio,
            referenceUrls: references,
            endReferenceUrl: endFrameUrl || undefined,
          })
          return { id: falRes.id, response: falRes }
        }
        if (provider === "google") {
          const googleRes = await submitGoogleVideo({
            model: input.model,
            prompt: resolvedPrompt,
            duration: durationSeconds,
            resolution: input.resolution,
            ratio: input.aspectRatio,
            referenceUrls: references,
          })
          return { id: googleRes.id, response: googleRes.response }
        }
        const bytePlusRes = await submitBytePlusVideo({
          model: input.model,
          prompt: resolvedPrompt,
          duration: durationSeconds,
          resolution: input.resolution,
          ratio: providerRatio,
          // The end frame is the last frame for a keyframe model, so it follows
          // the start frame rather than joining the loose references.
          referenceUrls: endFrameUrl ? [...references, endFrameUrl] : references,
          videoReferenceUrls: videoReferences,
          generationMode: "keyframe",
          audioEnabled: input.audioEnabled,
        })
        return { id: bytePlusRes.id, response: bytePlusRes.response }
      })

      await context.supabase
        .from("creator_generation_jobs")
        .update({ status: "processing", credits_used: creditCost, provider_job_id: task.id, provider_response: task.response })
        .eq("id", job.id)

      return NextResponse.json({
        jobId: job.id,
        providerJobId: task.id,
        status: "processing",
        provider,
        model: input.model,
        durationSeconds,
        creditsCharged: creditCost,
        billingMode: billing.mode,
        creditBalance: creditBalanceAfter,
      }, { status: 202 })
    } catch (error) {
      const errorMessage = studioErrorMessage(error, "Submission failed")
      await context.supabase
        .from("creator_generation_jobs")
        .update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() })
        .eq("id", job.id)
      const refund = pendingRefund
        ? await refundGenerationCredits(context.user.id, pendingRefund.amount, `generation-job:${job.id}`, "Refund: failed video generation", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      pendingRefund = null
      return NextResponse.json({
        error: errorMessage,
        jobId: job.id,
        creditsRefunded: refund.refunded ? creditCost : 0,
        creditBalance: refund.newBalance,
      }, {
        status: error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError
          ? error.status
          : studioErrorStatus(error),
      })
    }
  } catch (error) {
    if (openContext && pendingRefund) {
      try {
        await refundGenerationCredits(openContext.user.id, pendingRefund.amount, pendingRefund.key, "Refund: video generation could not start", null, openContext.supabase)
      } catch (refundError) {
        console.error("Could not refund failed standalone video generation", refundError)
      }
    }
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid video request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Video generation failed") }, {
      status: error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError
        ? error.status
        : studioErrorStatus(error),
    })
  }
}

/**
 * Polls the provider and stores whatever comes back.
 *
 * The clip is downloaded here rather than handed to the browser as a provider
 * URL, because those expire — a history that shows dead links a day later is
 * not a history.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthenticatedUser()
    const jobId = request.nextUrl.searchParams.get("jobId") || ""
    if (!jobId || !z.string().uuid().safeParse(jobId).success) {
      return NextResponse.json({ error: "Valid jobId is required" }, { status: 400 })
    }

    const { data: job } = await context.supabase
      .from("creator_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", context.user.id)
      .is("project_id", null)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 })
    if (["completed", "failed", "cancelled"].includes(job.status)) return NextResponse.json(job)
    if (!job.provider_job_id || !isVideoGenerationModel(job.model)) {
      return NextResponse.json({ error: "Generation job is missing provider details" }, { status: 409 })
    }

    const provider = generationProvider(job.model)
    /** Polls on the account that submitted, since a BYOK task is not on ours. */
    const byokProvider = byokProviderFor(provider)
    const pollOnBillingAccount = async <T,>(work: () => Promise<T>): Promise<T> => {
      if (job.billing_mode !== "byok" || !byokProvider) return work()
      const ran = await withCredential({ userId: context.user.id, provider: byokProvider }, (parts) =>
        runWithCredential(byokProvider, parts, work))
      if (ran === null) throw new Error("The provider key for this model is no longer connected.")
      return ran
    }

    const task = await pollOnBillingAccount(async () => {
      if (provider === "fal") {
        // fal endpoints are namespaced, and the endpoint a request was
        // submitted to is required to poll it.
        const storedEndpoint = (job.provider_response as Record<string, unknown> | null)?.endpoint
        const endpoint = typeof storedEndpoint === "string" && storedEndpoint.trim()
          ? (storedEndpoint.startsWith("fal-ai/") ? storedEndpoint : `fal-ai/${storedEndpoint}`)
          : "fal-ai/bytedance/seedance-2.0/text-to-video"
        return getFalVideoTask(job.provider_job_id, endpoint)
      }
      if (provider === "google") return getGoogleVideoTask(job.provider_job_id)
      return getBytePlusVideoTask(job.provider_job_id)
    })

    if (task.status === "failed" || task.status === "cancelled") {
      const error = task.error?.message || `${provider} task ${task.status}`
      // The recorded mode decides the refund. A BYOK clip charged nothing, so
      // refunding its estimate would print credits on every repeated failure.
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, `Refund: ${task.status} video generation`, job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      await context.supabase
        .from("creator_generation_jobs")
        .update({ status: task.status === "cancelled" ? "cancelled" : "failed", provider_response: task, error, completed_at: new Date().toISOString() })
        .eq("id", job.id)
      return NextResponse.json({
        ...job,
        status: task.status === "cancelled" ? "cancelled" : "failed",
        error,
        creditsRefunded: refund.refunded ? charged : 0,
        creditBalance: refund.newBalance,
      })
    }

    if (task.status !== "succeeded" || !task.content?.video_url) {
      return NextResponse.json({ ...job, status: "processing", providerStatus: task.status })
    }

    const output = await fetch(task.content.video_url)
    if (!output.ok) throw new BytePlusProviderError(`Could not download generated video (${output.status}).`)
    const storagePath = quickStoragePath({ userId: context.user.id, provider, kind: "video", extension: "mp4" })
    const { error: uploadError } = await context.supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, Buffer.from(await output.arrayBuffer()), { contentType: "video/mp4", upsert: false })
    if (uploadError) throw uploadError

    const completedAt = new Date().toISOString()
    await context.supabase
      .from("creator_generation_jobs")
      .update({ status: "completed", provider_response: task, result_url: storagePath, completed_at: completedAt })
      .eq("id", job.id)

    // The clip is downloaded, stored and recorded, and a later poll returns
    // early above — so this runs once per finished video.
    await trackGenerationActivation({
      supabase: context.supabase,
      userId: context.user.id,
      email: context.user.email,
      sourceUrl: "https://www.aidirectorhub.com/studio/create/video",
    })

    return NextResponse.json({ ...job, status: "completed", result_url: storagePath, completed_at: completedAt })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check video status") }, {
      status: error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError
        ? error.status
        : studioErrorStatus(error),
    })
  }
}
