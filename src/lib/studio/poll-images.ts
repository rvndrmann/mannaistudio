import { ownKeysOnly } from "@/lib/byok/preferences"
import { executeGenerationJobs, dispatchImageGenerationJob, settleWorkflowRun } from "./execute-generation"
import { canClaimGeneration } from "./generation-claim"
import { withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { byokProviderFor } from "@/lib/byok/providers"
import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { retrieveOpenAIImage } from "@/lib/studio/openai"
import { getFalImageTask } from "@/lib/studio/fal"
import { getHiggsfieldImageTask } from "@/lib/studio/higgsfield"
import { refundableCredits } from "@/lib/byok/billing"
import { refundGenerationCredits } from "@/lib/studio/credits"
import { isStalledImageJob } from "@/lib/studio/stalled-jobs"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

import type { AuthenticatedProjectContext } from "./server-context"
async function attachRecoveredImage(
  context: Awaited<ReturnType<typeof requireAuthenticatedProject>>,
  projectId: string,
  job: Record<string, unknown>,
  image: Buffer,
) {
  const storagePath = `${context.user.id}/${projectId}/openai-image-${randomUUID()}.png`
  const { error: uploadError } = await context.supabase.storage
    .from("creator-studio-media")
    .upload(storagePath, image, { contentType: "image/png", upsert: false })
  if (uploadError) throw uploadError

  const settings = job.settings && typeof job.settings === "object" ? job.settings as Record<string, unknown> : {}
  const target = typeof settings.target === "string" ? settings.target : (job.shot_id ? "shot" : "asset")

  if (target === "shot" && typeof job.shot_id === "string") {
    const { data: shot } = await context.supabase.from("creator_shots").select("metadata").eq("id", job.shot_id).maybeSingle()
    const meta = (shot?.metadata as Record<string, unknown>) || {}
    const generation = meta.image_generation && typeof meta.image_generation === "object" ? meta.image_generation as Record<string, unknown> : {}
    const { error: attachError } = await context.supabase.from("creator_shots").update({
      keyframe_image: storagePath,
      metadata: { ...meta, image_generation: { ...generation, status: "completed", recovered: true, completed_at: new Date().toISOString() } },
    }).eq("id", job.shot_id)
    if (attachError) throw attachError
  } else if (typeof job.entity_id === "string") {
    const { data: entity } = await context.supabase.from("creator_entities").select("reference_images").eq("id", job.entity_id).maybeSingle()
    const existing = Array.isArray(entity?.reference_images) ? entity.reference_images as string[] : []
    const { error: attachError } = await context.supabase.from("creator_entities").update({
      reference_images: Array.from(new Set([...existing, storagePath])),
    }).eq("id", job.entity_id)
    if (attachError) throw attachError
  }

  const { data: updated, error: updateError } = await context.supabase
    .from("creator_generation_jobs")
    .update({ status: "completed", result_url: storagePath, completed_at: new Date().toISOString(), error: null })
    .eq("id", job.id as string)
    .select("*")
    .single()
  if (updateError) throw updateError
  await settleWorkflowRun(context, job.workflow_run_id)
  return updated ?? { ...job, status: "completed", result_url: storagePath }
}


export async function pollImages(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }, suppliedContext?: AuthenticatedProjectContext, recoverTerminal = false, credentialScoped = false): Promise<NextResponse> {
  try {
    const { projectId } = await params
    const context = suppliedContext ?? await requireAuthenticatedProject(projectId)
    const jobId = new URL(request.url).searchParams.get("jobId") || ""
    if (!jobId) return NextResponse.json({ error: "Which job?" }, { status: 400 })

    const { data: job } = await context.supabase
      .from("creator_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
    if (await ownKeysOnly(context.user.id) && job.billing_mode !== "byok") return NextResponse.json({ error: "This subscription requires your own keys. Submit a new BYOK generation." }, { status: 403 })
    if (job.billing_mode === "byok" && !credentialScoped) {
      const provider = byokProviderFor(job.provider)
      if (!provider) return NextResponse.json({ error: "Unknown provider credential" }, { status: 409 })
      const result = await withCredential({ userId: job.user_id, provider }, (parts) => runWithCredential(provider, parts, () => pollImages(request, { params: Promise.resolve({ projectId }) }, context, recoverTerminal, true)))
      return result ?? NextResponse.json({ error: "The original provider key is no longer connected" }, { status: 409 })
    }
    if (job.status === "completed" || (!recoverTerminal && ["failed", "cancelled"].includes(job.status))) return NextResponse.json(job)
    if (recoverTerminal && !job.provider_job_id) return NextResponse.json({ error: "No provider ID was saved. This synchronous or interrupted submission cannot be re-polled." }, { status: 409 })

    // A detached batch can stop before reaching this approved image. Await
    // submission here, while this request is alive. The executor's atomic
    // claim prevents another poll or the original worker submitting it twice.
    // Already-started images are deliberately not reclaimed: a synchronous
    // provider may have charged for them without giving us a recovery handle.
    if (!job.provider_job_id && canClaimGeneration(job)) {
      if (job.model !== "gpt-image-2.5-sunburst" || !await dispatchImageGenerationJob(context, job.id as string)) await executeGenerationJobs(context, [job.id as string])
      const { data: current, error } = await context.supabase
        .from("creator_generation_jobs").select("*").eq("id", job.id).maybeSingle()
      if (error) throw error
      return NextResponse.json(current ?? job)
    }

    // Recovery before write-off.
    //
    // A job that recorded a provider response id has work OpenAI has already
    // been paid for, whatever happened to the request that started it. Failing
    // and refunding such a job threw away a finished picture the user had
    // bought — so the id is read back first, and only a job with no id, or one
    // OpenAI itself reports as finished-without-an-image, is written off.
    const responseId = typeof job.provider_job_id === "string" ? job.provider_job_id.trim() : ""

    if (responseId && job.provider === "higgsfield") {
      const poll = await getHiggsfieldImageTask(responseId)
      if (poll.status === "pending") {
        if (recoverTerminal) await context.supabase.from("creator_generation_jobs").update({ status: "processing", error: null }).eq("id", job.id)
        return NextResponse.json({ ...job, status: "processing", providerStatus: "pending" })
      }
      if (poll.status === "completed" && poll.urls[0]) {
        const download = await fetch(poll.urls[0])
        if (download.ok) return NextResponse.json(await attachRecoveredImage(context, projectId, job, Buffer.from(await download.arrayBuffer())))
      }
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0 ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: image generation failed", job.id, context.supabase) : { refunded: false, newBalance: 0 }
      const error = poll.error || "Higgsfield finished without returning an image."
      await context.supabase.from("creator_generation_jobs").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", job.id)
      return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }

    // A fal handle is a queue request id, not an OpenAI response id, and reading
    // it back takes the endpoint it was submitted to — recorded beside it. Sent
    // to OpenAI instead it would come back "not found" and write off a render
    // fal had finished and charged for.
    if (responseId && job.provider === "fal") {
      const response = (job.provider_response || {}) as { endpoint?: string }
      const poll = await getFalImageTask(responseId, response.endpoint || "fal-ai/flux/dev")
      if (poll.status === "pending") {
        if (recoverTerminal) {
          const { error } = await context.supabase.from("creator_generation_jobs").update({ status: "processing", error: null }).eq("id", job.id)
          if (error) throw error
        }
        return NextResponse.json({ ...job, status: "processing", providerStatus: "pending" })
      }
      if (poll.status === "completed" && poll.url) {
        const download = await fetch(poll.url)
        if (download.ok) {
          const recovered = await attachRecoveredImage(context, projectId, job, Buffer.from(await download.arrayBuffer()))
          return NextResponse.json(recovered)
        }
      }
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: image generation failed", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      const falError = poll.error || "fal.ai finished without returning an image."
      await context.supabase
        .from("creator_generation_jobs")
        .update({ status: "failed", error: falError, completed_at: new Date().toISOString() })
        .eq("id", job.id)
      return NextResponse.json({ ...job, status: "failed", error: falError, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }

    if (responseId) {
      const poll = await retrieveOpenAIImage(responseId, context.user.id)
      if (poll.status === "pending") {
        if (recoverTerminal) {
          const { error } = await context.supabase.from("creator_generation_jobs").update({ status: "processing", error: null }).eq("id", job.id)
          if (error) throw error
        }
        // Still rendering. Never settled on age alone: the render is alive at
        // OpenAI and this job has a name for it.
        return NextResponse.json({ ...job, status: "processing", providerStatus: "pending" })
      }
      if (poll.status === "completed") {
        const recovered = await attachRecoveredImage(context, projectId, job, poll.image)
        return NextResponse.json(recovered)
      }
      // OpenAI says it failed — a real, reportable outcome rather than a guess
      // from how long the row has been sitting there.
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: image generation failed", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      await context.supabase
        .from("creator_generation_jobs")
        .update({ status: "failed", error: poll.error, completed_at: new Date().toISOString() })
        .eq("id", job.id)
      return NextResponse.json({ ...job, status: "failed", error: poll.error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }

    // No handle to recover from — the request died before OpenAI accepted the
    // work, so nothing was produced and nothing was charged for. Settled only
    // once it has sat longer than any real generation takes.
    if (!isStalledImageJob(job)) return NextResponse.json(job)

    // Reads the recorded mode rather than whichever number is non-zero: a BYOK
    // job charged nothing, so the old fallback refunded its estimate.
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
