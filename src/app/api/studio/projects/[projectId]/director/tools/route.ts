import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { fetchStudioFeatureFlags } from "@/lib/studio/feature-flags"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { requestDirectorTool } from "@/lib/studio/tool-service"
import { enforceStudioRateLimit, StudioRateLimitError } from "@/lib/studio/rate-limit"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const flags = await fetchStudioFeatureFlags(context.supabase)
    if (!flags.ai_director_tools_enabled) return NextResponse.json({ error: "AI Director tools are not enabled" }, { status: 404 })
    await enforceStudioRateLimit(context.supabase, "director_tools", 30, 60)
    return NextResponse.json(await requestDirectorTool(context, await request.json()))
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid tool request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tool request failed" }, { status: error instanceof StudioRateLimitError ? 429 : studioErrorStatus(error) })
  }
}
