import type { AuthenticatedProjectContext } from "./server-context"

export type WorkflowRunStatus = "queued" | "planning" | "awaiting_approval" | "running" | "retrying" | "blocked" | "completed" | "partially_completed" | "cancelled" | "failed"

export async function createWorkflowRun(context: AuthenticatedProjectContext, input: { episodeId?: string; sessionId: string; objective: string; maxSteps: number; workflowId?: string }) {
  const { data, error } = await context.supabase.from("creator_workflow_runs").insert({ project_id: context.project.id, episode_id: input.episodeId || null, session_id: input.sessionId, user_id: context.user.id, objective: input.objective, max_steps: input.maxSteps, workflow_id: input.workflowId || null, status: "planning" }).select("*").single()
  if (error) throw error
  return data
}

export async function addWorkflowStep(context: AuthenticatedProjectContext, input: { runId: string; sequence: number; specialist?: string; label: string; status: string; toolExecutionId?: string; toolInput?: unknown; output?: unknown; error?: unknown }) {
  const { data, error } = await context.supabase.from("creator_workflow_steps").insert({ run_id: input.runId, sequence: input.sequence, specialist: input.specialist || null, label: input.label, status: input.status, tool_execution_id: input.toolExecutionId || null, input: input.toolInput || {}, output: input.output || null, error: input.error || null, started_at: new Date().toISOString(), completed_at: ["completed", "failed", "cancelled", "skipped"].includes(input.status) ? new Date().toISOString() : null }).select("*").single()
  if (error) throw error
  if (["awaiting_approval", "failed"].includes(input.status)) {
    await context.supabase.from("creator_workflow_checkpoints").insert({ run_id: input.runId, step_sequence: input.sequence, state: { status: input.status, input: input.toolInput || {}, output: input.output || null, error: input.error || null }, reason: input.status === "awaiting_approval" ? "Waiting for user approval" : "Tool failed and may be retried" })
  }
  const proposal = input.output && typeof input.output === "object" && "proposal" in input.output ? (input.output as { proposal?: { id?: string } }).proposal : null
  if (proposal?.id) await context.supabase.from("creator_workflow_artifacts").insert({ run_id: input.runId, step_id: data.id, artifact_type: "proposal", entity_type: "creator_action_proposals", entity_id: proposal.id, metadata: {} })
  await context.supabase.from("creator_workflow_runs").update({ current_step: input.sequence, status: input.status === "awaiting_approval" ? "awaiting_approval" : input.status === "failed" ? "partially_completed" : "running" }).eq("id", input.runId).eq("user_id", context.user.id)
  return data
}

export async function finishWorkflowRun(context: AuthenticatedProjectContext, runId: string, status: WorkflowRunStatus, summary: Record<string, unknown>, error?: unknown) {
  const { data, error: updateError } = await context.supabase.from("creator_workflow_runs").update({ status, summary, error: error || null, completed_at: ["completed", "partially_completed", "cancelled", "failed"].includes(status) ? new Date().toISOString() : null }).eq("id", runId).eq("user_id", context.user.id).select("*").single()
  if (updateError) throw updateError
  return data
}
