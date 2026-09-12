import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { managedErrorMessage, managedErrorStatus, requireManagedAdmin } from "@/lib/managed/server"
import { MANAGED_MEDIA_BUCKET, managedDeliverablePrefix } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * Send to Client.
 *
 * The bridge between the studio and the managed service, and the only way a
 * file crosses it. The bytes are *copied* out of the internal prefix into
 * `managed/{projectId}/deliverables/` rather than shared in place, which is what
 * makes the internal/client split real: the client's storage policy matches
 * only their own project folder, so an unpublished take has no path they could
 * be handed even if one leaked into a response.
 *
 * The source has to be a finished shot in the production linked to this order,
 * or a file the admin uploaded into this order's own folder. Anything else is
 * refused — without that check an admin URL could copy any object in the bucket
 * into a client's downloads.
 */

const publishSchema = z.object({
  deliverableId: z.string().uuid(),
  sourcePath: z.string().trim().min(1).max(500),
  label: z.string().trim().max(60).default(""),
  note: z.string().trim().max(2_000).default(""),
  durationSeconds: z.number().min(0).max(36_000).nullable().default(null),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, project } = await requireManagedAdmin(projectId)
    const input = publishSchema.parse(await request.json())

    if (input.sourcePath.includes("..") || /^https?:\/\//i.test(input.sourcePath)) {
      return NextResponse.json({ error: "That is not a stored file." }, { status: 400 })
    }

    // The deliverable has to belong to this order. Two orders' deliverables are
    // both visible to an admin, so the id alone is not enough.
    const { data: deliverable } = await supabase
      .from("managed_deliverables")
      .select("id,title")
      .eq("id", input.deliverableId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (!deliverable) return NextResponse.json({ error: "That deliverable is not on this order." }, { status: 404 })

    const alreadyClientSide = input.sourcePath.startsWith(`managed/${projectId}/`)
    if (!alreadyClientSide) {
      if (!project.studio_project_id) {
        return NextResponse.json({ error: "Open the Creator Studio production for this order first." }, { status: 400 })
      }
      const { data: shot } = await supabase
        .from("creator_shots")
        .select("id, creator_episodes!inner(project_id)")
        .eq("video_url", input.sourcePath)
        .eq("creator_episodes.project_id", project.studio_project_id)
        .maybeSingle()
      if (!shot) {
        return NextResponse.json(
          { error: "That file is not a finished shot in this order's production." },
          { status: 403 },
        )
      }
    }

    const admin = createServiceClient()
    const storage = admin.storage.from(MANAGED_MEDIA_BUCKET)
    const extension = input.sourcePath.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "mp4"
    const destination = `${managedDeliverablePrefix(projectId)}/${randomUUID()}.${extension}`

    const { error: copyError } = await storage.copy(input.sourcePath, destination)
    if (copyError) {
      return NextResponse.json({ error: `Could not copy the file: ${copyError.message}` }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("admin_managed_publish_version", {
      p_deliverable_id: input.deliverableId,
      p_storage_path: destination,
      p_label: input.label,
      p_note: input.note,
      p_thumbnail_path: "",
      p_duration_seconds: input.durationSeconds,
    })
    if (error) {
      // The copy already happened, so the orphan is removed rather than left
      // sitting in a client folder as a file with no version row behind it.
      await storage.remove([destination]).catch(() => undefined)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ version: Array.isArray(data) ? data[0] : data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That request could not be read." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not publish this version") },
      { status: managedErrorStatus(error) },
    )
  }
}
