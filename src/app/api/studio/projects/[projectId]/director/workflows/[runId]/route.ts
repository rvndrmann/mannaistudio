import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { studioErrorStatus } from "@/lib/studio/server-context"

const decisionSchema = z.object({ action: z.enum(["cancel", "resume", "retry"]) }).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string; runId: string }> }) {
  try {
    const { projectId, runId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const { data: run, error } = await context.supabase.from("creator_workflow_runs").select("*").eq("id", runId).eq("project_id", projectId).eq("user_id", context.user.id).single()
    if (error) throw error
    const [{ data: steps }, { data: artifacts }] = await Promise.all([
      context.supabase.from("creator_workflow_steps").select("*").eq("run_id", runId).order("sequence").order("attempt"),
      context.supabase.from("creator_workflow_artifacts").select("*").eq("run_id", runId).order("created_at"),
    ])
    return NextResponse.json({ run, steps: steps || [], artifacts: artifacts || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load workflow" }, { status: studioErrorStatus(error) })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; runId: string }> }) {
  try {
    const { projectId, runId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const body = decisionSchema.parse(await request.json())
    const { data: current, error: readError } = await context.supabase.from("creator_workflow_runs").select("*").eq("id", runId).eq("project_id", projectId).eq("user_id", context.user.id).single()
    if (readError) throw readError
    if (body.action === "cancel" && ["completed", "cancelled", "failed"].includes(current.status)) throw new Error("This workflow is already finished")
    if (body.action !== "cancel" && !["failed", "partially_completed", "blocked", "cancelled"].includes(current.status)) throw new Error("This workflow cannot be resumed from its current status")
    const status = body.action === "cancel" ? "cancelled" : body.action === "retry" ? "retrying" : "queued"
    const { data, error } = await context.supabase.from("creator_workflow_runs").update({ status, completed_at: null, error: null }).eq("id", runId).eq("user_id", context.user.id).select("*").single()
    if (error) throw error
    if (body.action === "cancel") await context.supabase.from("creator_workflow_steps").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("run_id", runId).in("status", ["pending", "running"])
    await context.supabase.from("creator_audit_events").insert({ project_id: projectId, user_id: context.user.id, actor_type: "user", event_type: `workflow.${body.action}`, entity_type: "creator_workflow_runs", entity_id: runId, details: { previousStatus: current.status, nextStatus: status } })
    return NextResponse.json({ run: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid workflow action", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update workflow" }, { status: studioErrorStatus(error) })
  }
}
