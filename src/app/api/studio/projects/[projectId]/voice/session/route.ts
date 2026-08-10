import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions } from "@/lib/studio/conversation"
import { directorFunctionDefinitions } from "@/lib/studio/director-agent"
import { createOpenAIRealtimeClientSecret, OpenAIProviderError } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { voiceSessionRequestSchema, voiceToolInstructions } from "@/lib/studio/voice"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { fetchDirectorRuntimeSettings, runtimeInstructions } from "@/lib/studio/director-runtime-settings"
import { fetchDirectorTeam, teamInstructions } from "@/lib/studio/director-team"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = voiceSessionRequestSchema.parse({ ...(await request.json()), projectId })
    const project = await buildProjectContext(context.supabase, context.project)
    // Voice runs the same Director tools as text chat, so it must run on the same
    // configured instructions. Loading only the defaults here meant admin settings
    // silently governed one agent and not the other.
    const { data: instructionSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
    const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings?.value)
    const [runtimeSettings, team] = await Promise.all([
      fetchDirectorRuntimeSettings(context.supabase),
      fetchDirectorTeam(context.supabase),
    ])
    const instructions = [
      await buildVoiceWorkflowInstructions(context, buildDirectorInstructions(project, globalInstructions)),
      teamInstructions(team),
      runtimeInstructions(runtimeSettings),
      voiceToolInstructions({ projectId, episodeId: input.episodeId }),
    ].join("\n\n")
    const session = await createOpenAIRealtimeClientSecret({ userId: context.user.id, voice: input.voice, instructions, tools: directorFunctionDefinitions() })
    return NextResponse.json({ provider: "openai", ...session, realtimeUrl: "https://api.openai.com/v1/realtime/calls" })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid voice session request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start voice director" }, { status: error instanceof OpenAIProviderError ? error.status : studioErrorStatus(error) })
  }
}

async function buildVoiceWorkflowInstructions(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, baseInstructions: string) {
  const workflows = await fetchDirectorWorkflows(context.supabase)
  const metadata = (context.project.metadata as Record<string, unknown> | undefined) || {}
  const selectedId = typeof metadata.default_workflow_id === "string"
    ? metadata.default_workflow_id
    : typeof (metadata.basic_settings as Record<string, unknown> | undefined)?.workflow === "string"
      ? (metadata.basic_settings as Record<string, unknown>).workflow as string
      : ""
  const workflow = workflows.find((item) => item.id === selectedId && item.status === "active")
  if (!workflow) return baseInstructions
  return [baseInstructions, `Selected workflow: ${workflow.title}`, `Workflow skill: ${workflow.skill}`, `Workflow instructions: ${workflow.instructions || workflow.description}`].join("\n")
}
