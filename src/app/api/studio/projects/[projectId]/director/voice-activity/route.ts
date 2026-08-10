import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"

// Records what the Voice Director did into the chat timeline, so a spoken action
// leaves the same visible audit trail as the same action typed in chat.
const voiceActivitySchema = z.object({
  sessionId: z.string().uuid(),
  tool: z.string().trim().min(1).max(120),
  status: z.enum(["completed", "awaiting_approval", "failed"]),
  summary: z.string().trim().min(1).max(2_000),
  proposalId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = voiceActivitySchema.parse(await request.json())

    // The session must belong to this caller before anything is written to it.
    const { data: session } = await context.supabase
      .from("creator_chat_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("user_id", context.user.id)
      .maybeSingle()
    if (!session) return NextResponse.json({ error: "Chat session not found" }, { status: 404 })

    const timeline = [
      { type: "tool_execution", tool: input.tool, label: `Voice: ${input.tool.replaceAll("_", " ")}`, status: input.status, executionId: input.executionId },
    ]

    const { data: message, error } = await context.supabase
      .from("creator_chat_messages")
      .insert({
        session_id: input.sessionId,
        role: "assistant",
        content: input.summary,
        tool_calls: [{ tool: input.tool, source: "voice", status: input.status }],
        suggested_actions: input.proposalId ? [{ type: "proposal", proposal: { id: input.proposalId } }] : [],
        timeline_blocks: timeline,
        timeline_version: 1,
      })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid voice activity", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record voice activity" }, { status: studioErrorStatus(error) })
  }
}
