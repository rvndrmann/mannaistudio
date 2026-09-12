import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createServiceClient } from "@/lib/supabase/service"
import { ensureProfile, managedErrorMessage, managedErrorStatus, managedServiceOpen, requireUser } from "@/lib/managed/server"
import { managedBriefSchema, managedServiceKeySchema } from "@/lib/managed-brief"
import { MANAGED_ASPECT_RATIOS, MANAGED_MEDIA_BUCKET, managedUploadPrefix } from "@/lib/managed-production"
import { loadCatalogue } from "@/lib/managed/catalogue"
import { packageFromCatalogue, serviceFromCatalogue, snapshotFor, type OfferSnapshot } from "@/lib/managed-offers"
import type { ManagedBrief } from "@/lib/managed-brief"
import type { SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * Opens a managed order, and starts paying for it.
 *
 * Same rule as every other purchase on the site: the price is never sent by the
 * browser. The request names a service and a package; this route looks the
 * package up in the catalogue and prices it, so a page left open across a price
 * change buys at today's price. The project row is created unpaid first and its
 * id travels in the Razorpay order notes, which is what verification reads back
 * — never the body of the verification request.
 *
 * Micro-drama has no package to price. It opens the same project with
 * `proposal_requested` and skips the gateway entirely, because quoting a
 * serialised show before agreeing its length would be a number we could not
 * stand behind.
 */

/**
 * Finishes the row the RPC created.
 *
 * Two things the order cannot have until it has an id. The brief's files were
 * uploaded before the project existed, so they sit under the client's personal
 * prefix where only that client can read them — and a brief whose product shots
 * the producing team cannot open is not a brief; they are copied into the
 * project's own folder. And the offer is snapshotted, so that editing or
 * retiring a gig later never rewrites what this client was told they were
 * buying.
 *
 * Copying rather than moving, and a failed copy is logged rather than thrown:
 * the brief keeps its original path and the order still goes through, which is
 * the right trade when the alternative is losing a paid order over one
 * attachment.
 */
async function finaliseNewProject(
  admin: SupabaseClient,
  projectId: string,
  ownerId: string,
  brief: ManagedBrief,
  snapshot: OfferSnapshot,
): Promise<void> {
  const storage = admin.storage.from(MANAGED_MEDIA_BUCKET)
  const attachments = await Promise.all(brief.attachments.map(async (attachment) => {
    if (!attachment.path.startsWith(`${ownerId}/`)) return attachment
    const destination = `${managedUploadPrefix(projectId)}/${attachment.path.split("/").pop()}`
    const { error } = await storage.copy(attachment.path, destination)
    if (error) {
      console.warn("Could not adopt a brief attachment:", { path: attachment.path, message: error.message })
      return attachment
    }
    await storage.remove([attachment.path]).catch(() => undefined)
    return { ...attachment, path: destination }
  }))

  await admin
    .from("managed_projects")
    .update({ brief: { ...brief, attachments }, offer_snapshot: snapshot })
    .eq("id", projectId)
}

const checkoutSchema = z.object({
  serviceType: managedServiceKeySchema,
  packageKey: z.string().trim().max(80).default(""),
  name: z.string().trim().max(160).default(""),
  aspectRatio: z.string().trim().max(20).default("9:16"),
  brandId: z.string().uuid().nullable().optional(),
  brief: managedBriefSchema,
}).strict()

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    const input = checkoutSchema.parse(await request.json())

    // Read with the caller's own client, so RLS decides what is on sale: a gig
    // left unpublished is a draft, and an order must not be placeable against
    // one just because its key was guessed.
    const catalogue = await loadCatalogue(supabase)
    const service = serviceFromCatalogue(catalogue, input.serviceType)
    if (!service || !service.isPublished) {
      return NextResponse.json({ error: "That service is not available." }, { status: 400 })
    }
    if (!await managedServiceOpen(supabase)) {
      return NextResponse.json(
        { error: "We are not taking new projects right now. Existing projects are unaffected." },
        { status: 403 },
      )
    }

    const aspectRatio = MANAGED_ASPECT_RATIOS.some((option) => option.value === input.aspectRatio)
      ? input.aspectRatio
      : "9:16"
    const projectName =
      input.name.trim() ||
      [input.brief.brandName, service.name].filter(Boolean).join(" — ") ||
      `${service.name} campaign`

    await ensureProfile(supabase, user)

    // A brand may only be attached by the person who owns it; otherwise an
    // order could point the production at someone else's brand room.
    let brandId: string | null = null
    if (input.brandId) {
      const { data: brand } = await supabase
        .from("creator_brands")
        .select("id")
        .eq("id", input.brandId)
        .eq("user_id", user.id)
        .maybeSingle()
      brandId = brand?.id ?? null
    }

    const admin = createServiceClient()

    if (service.quoteOnly) {
      const { data, error } = await admin.rpc("create_managed_project", {
        p_user_id: user.id,
        p_name: projectName,
        p_service_type: input.serviceType,
        p_package_key: "",
        p_brief: input.brief,
        p_video_count: 1,
        p_duration_seconds: 60,
        p_aspect_ratio: aspectRatio,
        p_revisions_included: 2,
        p_price_inr: 0,
        p_payment_status: "proposal_requested",
        p_brand_id: brandId,
      })
      if (error) throw error
      const project = Array.isArray(data) ? data[0] : data
      if (project?.id) await finaliseNewProject(admin, project.id, user.id, input.brief, snapshotFor(service, null))
      return NextResponse.json({ mode: "proposal", projectId: project?.id ?? null })
    }

    const resolved = packageFromCatalogue(catalogue, input.serviceType, input.packageKey)
    if (!resolved || !resolved.option.isPublished) {
      return NextResponse.json({ error: "Choose a package before checking out." }, { status: 400 })
    }
    const selected = resolved.option

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 })
    }

    const { data, error } = await admin.rpc("create_managed_project", {
      p_user_id: user.id,
      p_name: projectName,
      p_service_type: input.serviceType,
      p_package_key: selected.key,
      p_brief: input.brief,
      p_video_count: selected.videoCount,
      p_duration_seconds: selected.durationSeconds,
      p_aspect_ratio: aspectRatio,
      p_revisions_included: selected.revisions,
      p_price_inr: selected.priceInr,
      p_payment_status: "pending",
      p_brand_id: brandId,
    })
    if (error) throw error
    const project = Array.isArray(data) ? data[0] : data
    if (!project?.id) throw new Error("Could not open the project")

    await finaliseNewProject(admin, project.id, user.id, input.brief, snapshotFor(service, selected))

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount: selected.priceInr * 100,
      currency: "INR",
      receipt: `mng_${String(project.id).slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "managed_production",
        profile_id: user.id,
        managed_project_id: project.id,
        package_key: selected.key,
        email: user.email || "",
      },
    })

    return NextResponse.json({
      mode: "checkout",
      projectId: project.id,
      orderId: order.id,
      amount: selected.priceInr * 100,
      priceInr: selected.priceInr,
      keyId,
      packageName: selected.name,
      serviceName: service.name,
      email: user.email || "",
      name: user.user_metadata?.full_name || input.brief.brandName || "Client",
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Some answers could not be read. Check the brief and try again." }, { status: 400 })
    }
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not start checkout") },
      { status: managedErrorStatus(error) },
    )
  }
}
