import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions } from "@/lib/studio/conversation"
import { createOpenAIRealtimeClientSecret, OpenAIProviderError } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { voiceSessionRequestSchema } from "@/lib/studio/voice"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = voiceSessionRequestSchema.parse({ ...(await request.json()), projectId })
    const project = await buildProjectContext(context.supabase, context.project)
    const session = await createOpenAIRealtimeClientSecret({ userId: context.user.id, voice: input.voice, instructions: await buildVoiceWorkflowInstructions(context, buildDirectorInstructions(project)) })
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
