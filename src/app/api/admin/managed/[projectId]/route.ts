import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { managedErrorMessage, managedErrorStatus, requireManagedAdmin } from "@/lib/managed/server"
import { openStudioProjectForManaged } from "@/lib/managed/studio-bridge"
import { MANAGED_STATUSES } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * The producer's controls on one order: move it along, name its deliverables,
 * and open the internal Creator Studio production it will be made in.
 *
 * One route with an `action` rather than four: they are all "the admin changed
 * something about this order", they all need the same access check, and the
 * admin panel calls them from the same screen.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    status: z.enum([...MANAGED_STATUSES, "cancelled"] as [string, ...string[]]),
    note: z.string().trim().max(5_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("deliverable"),
    deliverableId: z.string().uuid().nullable().default(null),
    title: z.string().trim().max(200).default(""),
    position: z.number().int().min(1).max(100).nullable().default(null),
    aspectRatio: z.string().trim().max(20).default(""),
  }).strict(),
  z.object({ action: z.literal("open_studio") }).strict(),
  z.object({ action: z.literal("link_studio"), studioProjectId: z.string().uuid() }).strict(),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user, project } = await requireManagedAdmin(projectId)
    const input = bodySchema.parse(await request.json())

    if (input.action === "status") {
      const { data, error } = await supabase.rpc("admin_managed_set_status", {
        p_project_id: projectId,
        p_status: input.status,
        p_note: input.note ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ project: Array.isArray(data) ? data[0] : data })
    }

    if (input.action === "deliverable") {
      const { data, error } = await supabase.rpc("admin_managed_upsert_deliverable", {
        p_project_id: projectId,
        p_deliverable_id: input.deliverableId,
        p_title: input.title,
        p_position: input.position,
        p_aspect_ratio: input.aspectRatio,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ deliverable: Array.isArray(data) ? data[0] : data })
    }

    if (input.action === "link_studio") {
      // Only a production this admin can actually open, so a typo cannot point
      // the order at a stranger's project.
      const { data: existing } = await supabase
        .from("creator_projects")
        .select("id")
        .eq("id", input.studioProjectId)
        .maybeSingle()
      if (!existing) return NextResponse.json({ error: "That production was not found." }, { status: 404 })

      const { data, error } = await supabase.rpc("admin_managed_link_studio_project", {
        p_project_id: projectId,
        p_studio_project_id: input.studioProjectId,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ project: Array.isArray(data) ? data[0] : data })
    }

    // open_studio
    if (project.studio_project_id) {
      return NextResponse.json({
        studioProjectId: project.studio_project_id,
        alreadyOpen: true,
      })
    }
    if (project.payment_status !== "paid") {
      return NextResponse.json({ error: "This order has not been paid for yet." }, { status: 400 })
    }

    const admin = createServiceClient()
    const result = await openStudioProjectForManaged(supabase, admin, user.id, project)

    const { error: linkError } = await supabase.rpc("admin_managed_link_studio_project", {
      p_project_id: projectId,
      p_studio_project_id: result.projectId,
    })
    if (linkError) throw linkError

    // Opening the production is the moment work actually starts, so the order
    // stops saying "Brief Received" without anyone having to remember to move
    // it. A producer who has already moved it further is left alone.
    if (project.status === "brief_received") {
      await supabase.rpc("admin_managed_set_status", {
        p_project_id: projectId,
        p_status: "creative_research",
        p_note: null,
      })
    }

    return NextResponse.json({ studioProjectId: result.projectId, importedEntities: result.importedEntities })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That request could not be read." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not update this order") },
      { status: managedErrorStatus(error) },
    )
  }
}
