import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { fetchStudioFeatureFlags } from "@/lib/studio/feature-flags"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { decideDirectorProposal } from "@/lib/studio/tool-service"
import { enforceStudioRateLimit, StudioRateLimitError } from "@/lib/studio/rate-limit"

const decisionSchema = z.object({ decision: z.enum(["approved", "rejected"]) }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; proposalId: string }> }) {
  try {
    const { projectId, proposalId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const flags = await fetchStudioFeatureFlags(context.supabase)
    if (!flags.ai_director_tools_enabled) return NextResponse.json({ error: "AI Director tools are not enabled" }, { status: 404 })
    await enforceStudioRateLimit(context.supabase, "director_approvals", 20, 60)
    const { decision } = decisionSchema.parse(await request.json())
    return NextResponse.json(await decideDirectorProposal(context, proposalId, decision))
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid proposal decision", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Proposal decision failed" }, { status: error instanceof StudioRateLimitError ? 429 : studioErrorStatus(error) })
  }
}
