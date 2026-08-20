import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { generateOpenAIImage, openAIImageModels, OpenAIProviderError } from "@/lib/studio/openai"
import { createBytePlusAsset, generateBytePlusImage, BytePlusProviderError } from "@/lib/studio/byteplus"
import { FalProviderError, generateFalImage } from "@/lib/studio/fal"
import { generateGoogleImage, GoogleProviderError } from "@/lib/studio/google"
import { generationProvider, isImageGenerationModel, type ImageGenerationModelId } from "@/lib/studio/generation-models"
import { byokProviderFor } from "@/lib/byok/providers"
import { decideBilling, refundableCredits } from "@/lib/byok/billing"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { calculateCreditCost, deductUserCredits, refundGenerationCredits } from "@/lib/studio/credits"
import { trackGenerationActivation } from "@/lib/studio/activation"
import { StudioAccessError, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { openAIImageQuality } from "@/lib/studio/entity-image-workflow"
import { recordExistingAsset } from "@/lib/studio/byteplus-assets"
import {
  composeQuickPrompt,
  extensionForContentType,
  foreignReferences,
  MEDIA_BUCKET,
  quickStoragePath,
  generationJobRejection,
  requireAuthenticatedUser,
  signReferenceUrls,
  type QuickContext,
} from "@/lib/studio/quick-generation"

/**
 * An image, with no production attached.
 *
 * The storyboard route next door does the same generation inside a project: it
 * resolves the look, the cast, the camera package and the shot the result gets
 * written back onto. This one has a prompt and a model. Everything about
 * billing is identical, because the money does not care which page asked —
 * decideBilling, then the render inside the paying account's credential scope,
 * then a refund only if credits were actually taken.
 */

const imageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(12_000),
  model: z.string().refine(isImageGenerationModel, "Unsupported image model"),
  referenceImages: z.array(z.string().max(2_000)).max(8).default([]),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]).default("1:1"),
  quality: z.enum(["Low", "Medium", "High", "Ultra"]).default("Medium"),
}).strict()

// A High-quality gpt-image-2 render runs well past a default serverless
// timeout, and the function being killed mid-flight is what leaves a job in
// `processing` for ever with its credits unreturned.
export const maxDuration = 300

// Longer than the route may run, so a job still `processing` past this point
// cannot be working — whatever owned it is gone.
const STALLED_IMAGE_JOB_MS = 6 * 60 * 1000

/**
 * Settles an image job the server never got to finish.
 *
 * Image generation is synchronous, so there is no provider task to poll and
 * nothing will ever resolve a row whose request died. The page asks about such
 * a job here, and one that has outlived any real generation is failed and
 * refunded.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthenticatedUser()
    const jobId = new URL(request.url).searchParams.get("jobId") || ""
    if (!jobId) return NextResponse.json({ error: "Which job?" }, { status: 400 })

    const { data: job } = await context.supabase
      .from("creator_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", context.user.id)
      .is("project_id", null)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
    if (job.status !== "processing") return NextResponse.json(job)

    const startedAt = Date.parse(job.started_at || job.created_at || "")
    const runningMs = Number.isNaN(startedAt) ? 0 : Date.now() - startedAt
    if (runningMs < STALLED_IMAGE_JOB_MS) return NextResponse.json(job)

    // The recorded mode decides the refund, not whichever number is non-zero:
    // a BYOK job charged nothing, and refunding its estimate mints credits.
    const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
    const refund = charged > 0
      ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: image generation did not finish", job.id, context.supabase)
      : { refunded: false, newBalance: 0 }
    const error = "The image generation did not finish. Nothing was produced and the credits have been returned."
    await context.supabase
      .from("creator_generation_jobs")
      .update({ status: "failed", error, completed_at: new Date().toISOString() })
      .eq("id", job.id)

    return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check the image job") }, { status: studioErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  let pendingRefund: { amount: number; key: string; jobId: string | null } | null = null
  let pendingJobId: string | null = null
  // Held outside the try so the failure path can close the job out. A BYOK job
  // owes no refund, and hanging the job update off the refund record would
  // leave every failed BYOK generation stuck in `processing` in the history.
  let openContext: QuickContext | null = null
  try {
    const context = await requireAuthenticatedUser()
    openContext = context
    const input = imageRequestSchema.parse(await request.json())
    const provider = generationProvider(input.model)

    // Checked before anything is charged. Storage would refuse to sign someone
    // else's file anyway, but only after the credits were gone, which turns a
    // rejected reference into a charge for nothing.
    const foreign = foreignReferences(context.user.id, input.referenceImages)
    if (foreign.length) return NextResponse.json({ error: "One or more reference images do not belong to you." }, { status: 403 })

    const platformCost = calculateCreditCost(input.model, "image", 5, { quality: input.quality, aspectRatio: input.aspectRatio })
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
      const deduct = await deductUserCredits(context.user.id, creditCost, input.model, `Image Generation (${input.model})`, context.supabase)
      if (!deduct.success) {
        return NextResponse.json({ error: deduct.errorMessage || "Insufficient credits" }, { status: 402 })
      }
      creditBalanceAfter = deduct.newBalance
      // Only a charge can be refunded; a BYOK failure is the provider's bill.
      pendingRefund = { amount: creditCost, key: `image-quick:${randomUUID()}`, jobId: null }
    }

    const references = Array.from(new Set(input.referenceImages)).slice(0, 8)
    const resolvedPrompt = composeQuickPrompt(input.prompt, input.aspectRatio)

    const { data: job, error: jobError } = await context.supabase
      .from("creator_generation_jobs")
      .insert({
        user_id: context.user.id,
        // No project, no episode, no shot. This column being null is what marks
        // the job as standalone everywhere else that reads it.
        project_id: null,
        type: "image",
        status: "approved",
        provider,
        model: input.model,
        prompt: input.prompt,
        input_images: references,
        settings: {
          surface: "quick",
          aspectRatio: input.aspectRatio,
          quality: input.quality,
          basePrompt: input.prompt,
          composedPrompt: resolvedPrompt,
        },
        estimated_credits: creditCost,
        billing_mode: billing.mode,
        credits_used: 0,
        requires_approval: false,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (jobError) {
      const rejection = generationJobRejection(jobError)
      if (rejection) throw new StudioAccessError(rejection, 403)
      throw jobError
    }
    pendingJobId = job.id
    if (pendingRefund) pendingRefund = { ...pendingRefund, key: `generation-job:${job.id}`, jobId: job.id }

    const { error: processingError } = await context.supabase
      .from("creator_generation_jobs")
      .update({ status: "processing", credits_used: creditCost, started_at: new Date().toISOString() })
      .eq("id", job.id)
    if (processingError) throw processingError

    const referenceUrls = await signReferenceUrls(context, references)

    /**
     * The provider call runs inside the credential scope of whoever is paying.
     * Billing that says "your key" while the render happens on ours is the
     * failure that costs money and reports nothing.
     */
    const runOnBillingAccount = async <T,>(work: () => Promise<T>): Promise<T> => {
      if (billing.mode !== "byok" || !byokProvider) return work()
      const ran = await withCredential({ userId: context.user.id, provider: byokProvider }, (parts) =>
        runWithCredential(byokProvider, parts, work))
      if (ran === null) throw new Error("The provider key for this model is no longer connected.")
      return ran
    }

    // Returned rather than assigned outward: the render happens inside a
    // callback and TypeScript cannot see through one to know a variable was set.
    const rendered = await runOnBillingAccount(async (): Promise<{
      image: Buffer
      contentType: string
      byteplusAssetId: string | null
      registeredAsset: { assetId: string; name: string } | null
    }> => {
      if (provider === "openai") {
        const image = await generateOpenAIImage({
          userId: context.user.id,
          model: input.model as (typeof openAIImageModels)[number],
          prompt: resolvedPrompt,
          referenceUrls,
          aspectRatio: input.aspectRatio,
          quality: openAIImageQuality(input.quality === "Ultra" ? "High" : input.quality),
        })
        return { image, contentType: "image/png", byteplusAssetId: null, registeredAsset: null }
      }
      if (provider === "fal") {
        const generated = await generateFalImage({ model: input.model as ImageGenerationModelId, prompt: resolvedPrompt, referenceUrls })
        const download = await fetch(generated.url)
        if (!download.ok) throw new FalProviderError(`Could not download fal.ai output (${download.status}).`)
        return { image: Buffer.from(await download.arrayBuffer()), contentType: generated.contentType, byteplusAssetId: null, registeredAsset: null }
      }
      if (provider === "google") {
        const generated = await generateGoogleImage({ model: input.model as ImageGenerationModelId, prompt: resolvedPrompt, referenceUrls })
        const download = await fetch(generated.url)
        if (!download.ok) throw new GoogleProviderError(`Could not download Google AI Studio output (${download.status}).`)
        return { image: Buffer.from(await download.arrayBuffer()), contentType: generated.contentType, byteplusAssetId: null, registeredAsset: null }
      }
      const generated = await generateBytePlusImage({ model: input.model, prompt: resolvedPrompt, referenceUrls })
      // Seedream registers its own output as it generates it, so that Asset
      // Library slot is spent whether or not we record it. Recording is what
      // lets an admin see and reclaim it.
      let byteplusAssetId: string | null = null
      let registeredAsset: { assetId: string; name: string } | null = null
      try {
        const assetRes = await createBytePlusAsset({ imageUrl: generated.url, name: input.prompt.slice(0, 50) })
        byteplusAssetId = assetRes.assetId
        registeredAsset = { assetId: assetRes.assetId, name: input.prompt.slice(0, 50) }
      } catch (assetError) {
        console.warn("Could not auto-register Seedream output as BytePlus asset:", assetError)
      }
      const download = await fetch(generated.url)
      if (!download.ok) throw new BytePlusProviderError(`Could not download Seedream output (${download.status}).`)
      return { image: Buffer.from(await download.arrayBuffer()), contentType: generated.contentType, byteplusAssetId, registeredAsset }
    })

    const storagePath = quickStoragePath({
      userId: context.user.id,
      provider,
      kind: "image",
      extension: extensionForContentType(rendered.contentType),
    })
    const { error: uploadError } = await context.supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, rendered.image, { contentType: rendered.contentType, upsert: false })
    if (uploadError) throw uploadError

    if (rendered.registeredAsset) {
      await recordExistingAsset({
        supabase: context.supabase,
        sourcePath: storagePath,
        assetId: rendered.registeredAsset.assetId,
        name: rendered.registeredAsset.name,
        userId: context.user.id,
      })
    }

    const { error: completeError } = await context.supabase
      .from("creator_generation_jobs")
      .update({
        status: "completed",
        result_url: storagePath,
        credits_used: creditCost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    if (completeError) throw completeError
    pendingRefund = null

    await trackGenerationActivation({
      supabase: context.supabase,
      userId: context.user.id,
      email: context.user.email,
      sourceUrl: "https://www.aidirectorhub.com/studio/create/image",
    })

    return NextResponse.json({
      jobId: job.id,
      path: storagePath,
      imageUrl: storagePath,
      provider,
      model: input.model,
      byteplusAssetId: rendered.byteplusAssetId,
      creditsCharged: creditCost,
      billingMode: billing.mode,
      creditBalance: creditBalanceAfter,
    })
  } catch (error) {
    if (openContext && pendingRefund) {
      try {
        await refundGenerationCredits(openContext.user.id, pendingRefund.amount, pendingRefund.key, "Refund: failed image generation", pendingRefund.jobId, openContext.supabase)
      } catch (refundError) {
        console.error("Could not refund failed standalone image generation", refundError)
      }
    }
    if (openContext && pendingJobId) {
      try {
        await openContext.supabase
          .from("creator_generation_jobs")
          .update({ status: "failed", error: studioErrorMessage(error, "Image generation failed"), completed_at: new Date().toISOString() })
          .eq("id", pendingJobId)
      } catch (historyError) {
        console.error("Could not mark standalone image generation failed", historyError)
      }
    }
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({
      error: studioErrorMessage(error, "Image generation failed"),
      jobId: pendingJobId,
    }, {
      status: error instanceof OpenAIProviderError || error instanceof BytePlusProviderError || error instanceof FalProviderError || error instanceof GoogleProviderError
        ? error.status
        : studioErrorStatus(error),
    })
  }
}
