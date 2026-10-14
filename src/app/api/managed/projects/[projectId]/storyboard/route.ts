import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { managedErrorMessage, managedErrorStatus, requireManagedProject } from "@/lib/managed/server"

export const dynamic = "force-dynamic"

/**
 * The client's verdict on a storyboard round, frame by frame.
 *
 * A shape check and nothing more: `managed_submit_storyboard_review` re-checks
 * that the caller owns the order, so an admin reaching this URL is refused by
 * the database — signing off your own frames is not a sign-off. The same
 * function files each answer in the Studio production beside the frame.
 */

const reviewSchema = z.object({
  decisions: z.array(z.object({
    itemId: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested"]),
    feedback: z.string().trim().max(5_000).default(""),
  }).strict()).min(1).max(40),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase } = await requireManagedProject(projectId)
    const input = reviewSchema.parse(await request.json())

    const missing = input.decisions.find((decision) => decision.decision === "changes_requested" && !decision.feedback)
    if (missing) return NextResponse.json({ error: "Say what should change on each frame you sent back." }, { status: 400 })

    const { data, error } = await supabase.rpc("managed_submit_storyboard_review", {
      p_project_id: projectId,
      p_decisions: input.decisions,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ reviewed: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That review could not be read." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not send your review") },
      { status: managedErrorStatus(error) },
    )
  }
}
