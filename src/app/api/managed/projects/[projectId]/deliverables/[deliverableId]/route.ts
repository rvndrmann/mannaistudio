import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { managedErrorMessage, managedErrorStatus, requireManagedProject } from "@/lib/managed/server"
import { managedAttachmentSchema } from "@/lib/managed-brief"
import { isManagedClientPath } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * The client's two verdicts on a cut: approve it, or say what to change.
 *
 * Both are `SECURITY DEFINER` functions that re-check ownership themselves, so
 * this route is a shape check and nothing more — an admin who reached this URL
 * would still be refused by the database, because approving your own work is
 * not an approval.
 */

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }).strict(),
  z.object({
    action: z.literal("revision"),
    notes: z.string().trim().max(5_000).default(""),
    comments: z.array(z.object({
      timestampSeconds: z.number().min(0).max(36_000).nullable().default(null),
      body: z.string().trim().min(1).max(5_000),
    }).strict()).max(50).default([]),
    attachments: z.array(managedAttachmentSchema).max(10).default([]),
  }).strict(),
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; deliverableId: string }> },
) {
  try {
    const { projectId, deliverableId } = await params
    const { supabase } = await requireManagedProject(projectId)
    const input = actionSchema.parse(await request.json())

    if (input.action === "approve") {
      const { data, error } = await supabase.rpc("managed_approve_deliverable", { p_deliverable_id: deliverableId })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ deliverable: Array.isArray(data) ? data[0] : data })
    }

    if (!input.notes.trim() && !input.comments.length) {
      return NextResponse.json({ error: "Tell us what should change." }, { status: 400 })
    }
    const stray = input.attachments.find((attachment) => !isManagedClientPath(projectId, attachment.path))
    if (stray) return NextResponse.json({ error: "That attachment does not belong to this project." }, { status: 400 })

    const { data, error } = await supabase.rpc("managed_request_revision", {
      p_deliverable_id: deliverableId,
      p_notes: input.notes,
      // Sent as strings because the function reads them out of JSON with
      // `->>`, and a JSON number would arrive with whatever precision the
      // browser chose to serialise it at.
      p_comments: input.comments.map((comment) => ({
        timestampSeconds: comment.timestampSeconds === null ? "" : String(comment.timestampSeconds),
        body: comment.body,
      })),
      p_attachments: input.attachments,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ deliverable: Array.isArray(data) ? data[0] : data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That request could not be read." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not update this deliverable") },
      { status: managedErrorStatus(error) },
    )
  }
}
