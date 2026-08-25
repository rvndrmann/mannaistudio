import type { SupabaseClient } from "@supabase/supabase-js"
import type { AuthenticatedProjectContext } from "./server-context"

export type WorkflowRunStatus = "queued" | "planning" | "awaiting_approval" | "running" | "retrying" | "blocked" | "completed" | "partially_completed" | "cancelled" | "failed"

// Silence, not age, is what tells a dead run from a slow one: a run that is
// still going writes a step every time a tool finishes, and a long one is
// perfectly normal — runs of seven minutes finish successfully. Nothing
// observed has ever gone this long between writes, so a run that has, is one
// whose server went away — a deploy, a timeout, a crash — and it will never
// write its own ending.
export const abandonedRunSilentAfterMs = 8 * 60 * 1000

/**
 * The longest a run can be alive at all, whatever it is writing.
 *
 * A run executes inside the request that created it, and that request is capped
 * by the Director chat route's own `maxDuration` of 300s. Past that the process
 * is gone, so a run still reading as in flight is not slow — it is dead, and no
 * amount of further waiting will produce its reply.
 *
 * Silence alone could not see this. A run that wrote a step at four minutes and
 * was killed at five stayed "running" for eight more minutes from that write,
 * with the chat showing a bubble for a process that no longer existed. That is
 * the wait this bound removes: three of those minutes were provably pointless.
 *
 * The grace is for the gap between the row being written and the work starting.
 */
export const runHardTimeoutMs = 300 * 1000 + 30 * 1000

// Statuses a run only leaves by finishing. `awaiting_approval` and `blocked` are
// deliberately absent: those wait on the user, for as long as the user takes.
const inFlightRunStatuses = ["queued", "planning", "running", "retrying"]

export const abandonedRunError = {
  code: "run_interrupted",
  message: "This run stopped before it could reply — the server handling it went away. Nothing was charged for the unfinished work.",
}

export type AbandonableRun = { id: string; user_id?: string | null; status: string; completed_at?: string | null; started_at?: string | null; updated_at?: string | null }

export function isAbandonedRun(run: AbandonableRun, now = Date.now()) {
  if (run.completed_at || !inFlightRunStatuses.includes(run.status)) return false
  const startedAt = new Date(run.started_at || 0).getTime()
  if (startedAt && startedAt < now - runHardTimeoutMs) return true
  const lastWrite = new Date(run.updated_at || run.started_at || 0).getTime()
  return Boolean(lastWrite) && lastWrite < now - abandonedRunSilentAfterMs
}

/**
 * Closes out runs whose server died mid-flight.
 *
 * A run is persisted before the work starts so the page can rejoin it after a
 * reload, and it is only marked finished by the process doing the work. When
 * that process is killed there is nobody left to write the ending, so the row
 * stays "running" and the chat waits on a reply that is never coming. Reading
 * the workspace is the moment to notice — and the only one, since the run has
 * no other heartbeat.
 *
 * The rows are handed in rather than matched by a query so that the read which
 * found them can serve the corrected state straight away, and so a workspace
 * with nothing wrong with it never writes at all.
 */
export async function failAbandonedRuns(supabase: SupabaseClient, input: { projectId: string; userId: string; runs: AbandonableRun[] }) {
  const now = Date.now()
  const abandoned = input.runs.filter((run) => run.user_id === input.userId && isAbandonedRun(run, now))
  if (!abandoned.length) return []
  const completedAt = new Date(now).toISOString()
  const { error } = await supabase
    .from("creator_workflow_runs")
    .update({ status: "failed", error: abandonedRunError, completed_at: completedAt })
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .is("completed_at", null)
    .in("id", abandoned.map((run) => run.id))
  if (error) throw error
  for (const run of abandoned) Object.assign(run, { status: "failed", error: abandonedRunError, completed_at: completedAt })
  return abandoned
}

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
