import { getHiggsfieldVideoTask } from "./higgsfield"
import { withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { byokProviderFor } from "@/lib/byok/providers"
import { createHash, randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { executeGenerationJobs, settleWorkflowRun } from "./execute-generation"
import { BytePlusProviderError, getBytePlusVideoTask } from "./byteplus"
import { falVideoEndpoint, FalProviderError, getFalVideoTask } from "./fal"
import { getGoogleVideoTask } from "./google"
import { refundableCredits } from "@/lib/byok/billing"
import { refundGenerationCredits } from "./credits"
import { trackGenerationActivation } from "./activation"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "./server-context"
import { canClaimGeneration } from "./generation-claim"
import { isStalledVideoJob } from "./stalled-jobs"
import { seedanceCopyrightRefusal } from "./seedance-reference-error"
import { generationProvider, isVideoGenerationModel } from "./generation-models"
import type { AuthenticatedProjectContext } from "./server-context"

export async function pollVideos(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }, suppliedContext?: AuthenticatedProjectContext, recoverTerminal = false, credentialScoped = false): Promise<NextResponse> {
  try {
    const { projectId } = await params
    const context = suppliedContext ?? await requireAuthenticatedProject(projectId)
    const jobId = request.nextUrl.searchParams.get("jobId")
    if (!jobId || !z.string().uuid().safeParse(jobId).success) return NextResponse.json({ error: "Valid jobId is required" }, { status: 400 })
    const { data: job } = await context.supabase.from("creator_generation_jobs").select("*").eq("id", jobId).eq("project_id", projectId).eq("user_id", context.user.id).maybeSingle()
    if (!job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 })
    if (job.billing_mode === "byok" && !credentialScoped) {
      const provider = byokProviderFor(job.provider)
      if (!provider) return NextResponse.json({ error: "Unknown provider credential" }, { status: 409 })
      const result = await withCredential({ userId: job.user_id, provider }, (parts) => runWithCredential(provider, parts, () => pollVideos(request, { params: Promise.resolve({ projectId }) }, context, recoverTerminal, true)))
      return result ?? NextResponse.json({ error: "The original provider key is no longer connected" }, { status: 409 })
    }
    if (job.status === "completed" || (!recoverTerminal && ["failed", "cancelled"].includes(job.status))) return NextResponse.json(job)
    if (recoverTerminal && !job.provider_job_id) return NextResponse.json({ error: "No provider ID was saved. This synchronous or interrupted submission cannot be re-polled." }, { status: 409 })
    // Recover submissions with no provider handle before considering a refund.
    if (!job.provider_job_id) {
      // The executor atomically claims approved or abandoned submissions.
      // Never pre-mark processing: that used to make the executor skip them.
      if (canClaimGeneration(job)) {
        await executeGenerationJobs(context, [job.id as string])
        const { data: ran, error: reloadError } = await context.supabase
          .from("creator_generation_jobs")
          .select("*")
          .eq("id", job.id)
          .maybeSingle()
        if (reloadError) throw reloadError
        if (ran) return NextResponse.json(ran)
        return NextResponse.json({ ...job, providerStatus: "submitting" })
      }
      if (!isStalledVideoJob(job, null)) {
        return NextResponse.json({ ...job, status: job.status, providerStatus: "submitting" })
      }
      // Says the refund happened, because it does happen four lines below. The
      // previous wording carried it and this one had dropped it, which leaves a
      // user who has just watched three attempts fail wondering whether they
      // have now paid for four.
      const error = "Video submission timed out: no provider task ID was received, so the server never finished submitting this request. Nothing was rendered and the credits have been returned. Try generating it again."
      let failure = context.supabase.from("creator_generation_jobs")
        .update({ status: "failed", error, completed_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", job.status).is("provider_job_id", null)
      failure = job.started_at ? failure.eq("started_at", job.started_at) : failure.is("started_at", null)
      const { data: failed, error: failureError } = await failure.select("id").maybeSingle()
      if (failureError) throw failureError
      // Another poll renewed the claim or saved its provider handle. Never
      // overwrite that work or refund a request which has just been submitted.
      if (!failed) {
        const { data: current, error: currentError } = await context.supabase.from("creator_generation_jobs").select("*").eq("id", job.id).single()
        if (currentError) throw currentError
        return NextResponse.json(current)
      }
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: video generation was never submitted", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      if (job.shot_id) {
        await context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", job.shot_id)
      }
      return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }
    if (!isVideoGenerationModel(job.model)) return NextResponse.json({ error: "Generation job is missing provider details" }, { status: 409 })

    const provider = generationProvider(job.model)
    let task: { status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; content?: { video_url?: string }; error?: { message?: string }; created_at?: number; updated_at?: number }

    if (provider === "higgsfield") {
      task = await getHiggsfieldVideoTask(job.provider_job_id)
    } else if (provider === "fal") {
      // The endpoint a request was submitted to is what polls it, so it is used
      // exactly as it was stored. It used to have "fal-ai/" forced back on when
      // it did not start with it, which was written when every fal model was
      // owned by fal-ai — Seedance 2.x is owned by `bytedance`, and the prefix
      // turns a working endpoint into the 404 that broke every one of those
      // renders. A job old enough to have stored no endpoint is rebuilt from
      // its model and the references it was given.
      const storedEndpoint = (job.provider_response as Record<string, unknown>)?.endpoint
      const endpoint = typeof storedEndpoint === "string" && storedEndpoint.trim()
        ? storedEndpoint.trim()
        : falVideoEndpoint(job.model, Array.isArray(job.input_images) ? job.input_images.length : 0)
      task = await getFalVideoTask(job.provider_job_id, endpoint)
    } else if (provider === "google") {
      task = await getGoogleVideoTask(job.provider_job_id)
    } else {
      task = await getBytePlusVideoTask(job.provider_job_id)
    }

    if (task.status === "failed" || task.status === "cancelled") {
      const rawFailure = task.error?.message || `${provider} task ${task.status}`
      // The provider's copyright refusal says nothing a user can act on.
      const error = seedanceCopyrightRefusal(rawFailure) || rawFailure
      // Reads the recorded billing mode, not whichever number is non-zero. A
      // BYOK clip charged nothing, so this fallback would refund its estimate —
      // and a provider that keeps failing would print credits.
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, `Refund: ${task.status} video generation`, job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: task.status === "cancelled" ? "cancelled" : "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: task.status === "cancelled" ? "cancelled" : "failed", error: { message: error }, completed_at: new Date().toISOString() }).eq("id", job.workflow_run_id)
      return NextResponse.json({ ...job, status: task.status === "cancelled" ? "cancelled" : "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }
    // A task the provider queue accepted but never started. BytePlus leaves
    // updated_at exactly at created_at in that case and holds the task for up to
    // two days, so without this the shot span its generating animation for the
    // whole of it and the reserved credits were never returned. Settling it here
    // is the same contract the failed branch above already honours.
    if (isStalledVideoJob(job, task)) {
      const charged = refundableCredits(job as { billing_mode?: string | null; credits_used?: number | null; estimated_credits?: number | null })
      const refund = charged > 0
        ? await refundGenerationCredits(context.user.id, charged, `generation-job:${job.id}`, "Refund: video generation was never started by the provider", job.id, context.supabase)
        : { refunded: false, newBalance: 0 }
      const error = "The video provider accepted this job but never started it. Nothing was rendered and the credits have been returned. Try generating it again."
      await Promise.all([
        context.supabase.from("creator_generation_jobs").update({ status: "failed", provider_response: task, error, completed_at: new Date().toISOString() }).eq("id", job.id),
        job.shot_id ? context.supabase.from("creator_shots").update({ video_status: "failed" }).eq("id", job.shot_id) : Promise.resolve(),
      ])
      if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "failed", error: { message: error }, completed_at: new Date().toISOString() }).eq("id", job.workflow_run_id)
      return NextResponse.json({ ...job, status: "failed", error, creditsRefunded: refund.refunded ? charged : 0, creditBalance: refund.newBalance })
    }
    if (task.status !== "succeeded" || !task.content?.video_url) {
      if (recoverTerminal) {
        const { error } = await context.supabase.from("creator_generation_jobs").update({ status: "processing", error: null }).eq("id", job.id)
        if (error) throw error
      }
      return NextResponse.json({ ...job, status: "processing", providerStatus: task.status })
    }

    const output = await fetch(task.content.video_url)
    if (!output.ok) throw new BytePlusProviderError(`Could not download generated video (${output.status}).`)
    const storagePath = `${context.user.id}/${projectId}/${provider}-video-${randomUUID()}.mp4`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, Buffer.from(await output.arrayBuffer()), { contentType: "video/mp4", upsert: false })
    if (uploadError) throw uploadError
    const completedAt = new Date().toISOString()
    if (!job.shot_id) throw new Error("Generation completed without a target shot")
    const { error: attachError } = await context.supabase.from("creator_shots").update({ video_url: storagePath, video_status: "completed" }).eq("id", job.shot_id)
    if (attachError) throw attachError
    const { data: verifiedShot, error: verifyError } = await context.supabase.from("creator_shots").select("id,episode_id,video_url,referenced_entities").eq("id", job.shot_id).maybeSingle()
    if (verifyError) throw verifyError
    const target = job.target_snapshot && typeof job.target_snapshot === "object" ? job.target_snapshot as Record<string, unknown> : {}
    const expectedReferences = Array.isArray(target.entityReferenceIds) ? target.entityReferenceIds.filter((id): id is string => typeof id === "string") : []
    const checks = {
      shot: verifiedShot?.id === target.shotId || !target.shotId,
      episode: verifiedShot?.episode_id === target.episodeId || !target.episodeId,
      prompt: createHash("sha256").update(job.prompt || "").digest("hex") === target.promptHash || !target.promptHash,
      references: expectedReferences.every((id) => (verifiedShot?.referenced_entities || []).includes(id)),
      attachment: verifiedShot?.video_url === storagePath,
    }
    if (Object.values(checks).some((value) => !value)) throw new Error(`Generation verification failed: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`)
    const verification = { status: "verified", checkedAt: new Date().toISOString(), checks, resultPath: storagePath }
    await context.supabase.from("creator_generation_jobs").update({ status: "completed", provider_response: task, result_url: storagePath, verification, completed_at: completedAt }).eq("id", job.id)
    if (job.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "completed", summary: { generationJobs: 1, completed: 1, failed: 0, verified: 1 }, completed_at: completedAt }).eq("id", job.workflow_run_id)
    // The clip is downloaded, stored, attached and verified. A later poll of the
    // same job returns early above, so this runs once per finished video.
    await trackGenerationActivation({
      supabase: context.supabase,
      userId: context.user.id,
      email: context.user.email,
      sourceUrl: `https://www.aidirectorhub.com/studio/project/${projectId}`,
    })
    await settleWorkflowRun(context, job.workflow_run_id)
    return NextResponse.json({ ...job, status: "completed", result_url: storagePath, verification, completed_at: completedAt })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not check video status") }, { status: error instanceof BytePlusProviderError || error instanceof FalProviderError ? error.status : studioErrorStatus(error) })
  }
}
