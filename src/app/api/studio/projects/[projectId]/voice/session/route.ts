import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions } from "@/lib/studio/conversation"
import { directorFunctionDefinitions } from "@/lib/studio/director-agent"
import { createOpenAIRealtimeClientSecret, OpenAIProviderError } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { loadProjectBrandContext } from "@/lib/studio/brand-server"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { voiceSessionRequestSchema, voiceToolInstructions } from "@/lib/studio/voice"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { fetchDirectorRuntimeSettings, runtimeInstructions } from "@/lib/studio/director-runtime-settings"
import { fetchDirectorTeam, teamInstructions } from "@/lib/studio/director-team"
import { fetchVoiceInstructions, voiceHistoryInstructions, type VoiceHistoryMessage } from "@/lib/studio/voice-instructions"
import { buildProjectStateSummary } from "@/lib/studio/project-state-summary"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = voiceSessionRequestSchema.parse({ ...(await request.json()), projectId })
    const project = await buildProjectContext(context.supabase, context.project)
    const { data: instructionSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
    const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings?.value)
    const brandContext = await loadProjectBrandContext(context.supabase, context.project)
    const [runtimeSettings, team, voiceInstructions, projectStateSummary] = await Promise.all([
      fetchDirectorRuntimeSettings(context.supabase),
      fetchDirectorTeam(context.supabase),
      fetchVoiceInstructions(context.supabase),
      buildProjectStateSummary(context.supabase, context.project.id, input.episodeId),
    ])

    let history: VoiceHistoryMessage[] = []
    if (input.chatSessionId) {
      const { data: session } = await context.supabase
        .from("creator_chat_sessions")
        .select("id")
        .eq("id", input.chatSessionId)
        .eq("user_id", context.user.id)
        .maybeSingle()
      if (session) {
        const { data: messages } = await context.supabase
          .from("creator_chat_messages")
          .select("role,content")
          .eq("session_id", input.chatSessionId)
          .order("created_at", { ascending: false })
          .limit(12)
        history = (messages || []).reverse()
      }
    }

    const instructions = [
      await buildVoiceWorkflowInstructions(context, buildDirectorInstructions(project, globalInstructions, brandContext)),
      projectStateSummary,
      teamInstructions(team),
      runtimeInstructions(runtimeSettings),
      voiceToolInstructions({ projectId, episodeId: input.episodeId }),
      voiceInstructions,
      voiceHistoryInstructions(history),
    ].filter(Boolean).join("\n\n")

    const contextSummary = { historyMessages: history.length, hasVoiceInstructions: Boolean(voiceInstructions), instructionChars: instructions.length }
    if (request.nextUrl.searchParams.get("dryRun") === "1") {
      return NextResponse.json({ dryRun: true, ...contextSummary, includesHistory: instructions.includes("Recent conversation from the chat panel") })
    }
    const session = await createOpenAIRealtimeClientSecret({ userId: context.user.id, voice: input.voice, instructions, tools: directorFunctionDefinitions() })
    return NextResponse.json({ provider: "openai", ...session, realtimeUrl: "https://api.openai.com/v1/realtime/calls", context: contextSummary })
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
