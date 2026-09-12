import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { managedErrorMessage, managedErrorStatus, requireManagedProject } from "@/lib/managed/server"
import { managedAttachmentSchema } from "@/lib/managed-brief"
import { isManagedClientPath } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

const messageSchema = z.object({
  body: z.string().trim().max(8_000).default(""),
  attachments: z.array(managedAttachmentSchema).max(10).default([]),
  deliverableId: z.string().uuid().nullable().optional(),
}).strict()

/**
 * One message in the project conversation.
 *
 * The insert goes through the caller's own client so the RLS policy decides
 * whether they belong on this thread, and `sender_is_admin` is set from the
 * server's own check rather than from the body — otherwise a client could post
 * as the team. Attachment paths are confined to this project's client folder,
 * so a message cannot be used to hand someone a signed URL for a file from
 * somewhere else in the bucket.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user, isAdmin } = await requireManagedProject(projectId)
    const input = messageSchema.parse(await request.json())

    if (!input.body.trim() && !input.attachments.length) {
      return NextResponse.json({ error: "Write a message or attach a file." }, { status: 400 })
    }
    const stray = input.attachments.find((attachment) => !isManagedClientPath(projectId, attachment.path))
    if (stray) return NextResponse.json({ error: "That attachment does not belong to this project." }, { status: 400 })

    const { data, error } = await supabase
      .from("managed_messages")
      .insert({
        project_id: projectId,
        sender_id: user.id,
        sender_is_admin: isAdmin,
        kind: "chat",
        body: input.body,
        attachments: input.attachments,
        deliverable_id: input.deliverableId ?? null,
      })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That message could not be sent." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not send the message") },
      { status: managedErrorStatus(error) },
    )
  }
}
