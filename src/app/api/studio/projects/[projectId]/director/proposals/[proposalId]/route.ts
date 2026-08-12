import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { fetchStudioFeatureFlags } from "@/lib/studio/feature-flags"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { decideDirectorProposal } from "@/lib/studio/tool-service"
import { enforceStudioRateLimit, StudioRateLimitError } from "@/lib/studio/rate-limit"
import { describeError } from "@/lib/studio/errors"

// `overrides` carries edits made in the chat generation block. It is merged
// into the stored payload and then validated by the tool's own input schema,
// which stays the security boundary.
const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  overrides: z.record(z.string(), z.unknown()).optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; proposalId: string }> }) {
  try {
    const { projectId, proposalId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const flags = await fetchStudioFeatureFlags(context.supabase)
    if (!flags.ai_director_tools_enabled) return NextResponse.json({ error: "AI Director tools are not enabled" }, { status: 404 })
    await enforceStudioRateLimit(context.supabase, "director_approvals", 20, 60)
    const { decision, overrides } = decisionSchema.parse(await request.json())
    return NextResponse.json(await decideDirectorProposal(context, proposalId, decision, overrides))
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid proposal decision", issues: error.flatten() }, { status: 400 })
    // Supabase rejects with a PostgrestError, which is a plain object rather
    // than an Error. Reporting only "Proposal decision failed" for those hid
    // every database cause behind an unactionable message.
    console.error("PROPOSAL DECISION ERROR:", error)
    return NextResponse.json({ error: describeError(error, "Proposal decision failed") }, { status: error instanceof StudioRateLimitError ? 429 : studioErrorStatus(error) })
  }
}
