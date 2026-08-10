import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { directorTools, type DirectorToolName } from "./tool-registry"

export const toolRequestSchema = z.object({
  tool: z.enum(["inspect_current_project", "update_creative_brief", "create_series", "write_series_bible", "create_production_entity", "record_continuity_fact", "inspect_continuity", "estimate_generation_cost", "submit_generation", "update_script", "update_shot", "delete_shot", "update_asset", "attach_media_to_asset", "delete_asset", "attach_media_to_shot", "update_full_auto_mode", "create_revision_request"]),
  input: z.unknown(),
  idempotencyKey: z.string().trim().min(8).max(200),
  sessionId: z.string().uuid().optional(),
}).strict()

export async function requestDirectorTool(context: AuthenticatedProjectContext, raw: unknown) {
  const request = toolRequestSchema.parse(raw)
  const tool = directorTools[request.tool]
  const input = tool.input.parse(request.input)

  const { data: existing } = await context.supabase
    .from("creator_tool_executions")
    .select("id,status,output,error")
    .eq("user_id", context.user.id)
    .eq("idempotency_key", request.idempotencyKey)
    .maybeSingle()
  if (existing) return { reused: true, execution: existing }

  const executionId = randomUUID()
  const status = tool.requiresApproval ? "awaiting_approval" : "started"
  const { error: executionError } = await context.supabase.from("creator_tool_executions").insert({
    id: executionId,
    project_id: context.project.id,
    user_id: context.user.id,
    session_id: request.sessionId ?? null,
    tool_name: tool.name,
    tool_version: tool.version,
    risk: tool.risk,
    status,
    idempotency_key: request.idempotencyKey,
    input,
  })
  if (executionError) throw executionError

  if (tool.requiresApproval) {
    const proposalCopy = describeProposal(tool.name, input)
    const { data: proposal, error } = await context.supabase.from("creator_action_proposals").insert({
      project_id: context.project.id,
      user_id: context.user.id,
      tool_execution_id: executionId,
      action_type: tool.name,
      title: proposalCopy.title,
      summary: proposalCopy.summary,
      payload: input,
      estimated_credits: proposalCopy.estimatedCredits,
      affected_entities: proposalCopy.affectedEntities,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }).select("*").single()
    if (error) throw error
    await audit(context, "tool.proposal_created", "creator_action_proposals", proposal.id, { tool: tool.name, executionId })
    return { reused: false, approvalRequired: true, executionId, proposal }
  }

  try {
    const data = await tool.execute(context, input as never)
    const { error: finishError } = await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: executionId, p_status: "completed", p_output: data, p_error: null })
    if (finishError) throw finishError
    await audit(context, "tool.completed", "creator_tool_executions", executionId, { tool: tool.name })
    return { reused: false, approvalRequired: false, executionId, data }
  } catch (error) {
    const detail = { message: error instanceof Error ? error.message : "Tool failed" }
    await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: executionId, p_status: "failed", p_output: null, p_error: detail })
    throw error
  }
}

function describeProposal(toolName: string, input: unknown) {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {}
  if (toolName === "submit_generation") {
    const request = payload.request && typeof payload.request === "object" ? payload.request as { type?: unknown; shotIds?: unknown } : {}
    const shotIds = Array.isArray(request.shotIds) ? request.shotIds : []
    return {
      title: request.type === "video" ? "Generate storyboard video" : "Generate storyboard image",
      summary: `Review ${shotIds.length || 1} ${request.type === "video" ? "video" : "image"} generation job${shotIds.length === 1 ? "" : "s"} before credits are reserved.`,
      estimatedCredits: 0,
      affectedEntities: shotIds.map((id) => ({ type: "shot", id })),
    }
  }
  const titles: Record<string, string> = {
    update_creative_brief: "Update the creative brief",
    create_series: "Create series",
    write_series_bible: "Write series bible",
    create_production_entity: "Create asset",
    record_continuity_fact: "Record continuity fact",
    update_script: "Update saved script",
    update_shot: "Update storyboard shot",
    delete_shot: "Delete storyboard shot",
    update_asset: "Update asset",
    attach_media_to_asset: "Attach uploaded media to asset",
    delete_asset: "Delete asset",
    attach_media_to_shot: "Attach uploaded media to storyboard shot",
    update_full_auto_mode: "Update full-auto mode",
    create_revision_request: "Create revision request",
  }
  return {
    title: titles[toolName] || `Approve ${toolName}`,
    summary: toolName.includes("delete") ? "This will remove saved project content after approval." : "Review this proposed project change before it is applied.",
    estimatedCredits: 0,
    affectedEntities: [],
  }
}

export async function decideDirectorProposal(context: AuthenticatedProjectContext, proposalId: string, decision: "approved" | "rejected") {
  const { data: proposal, error } = await context.supabase.rpc("creator_decide_action_proposal", { p_proposal_id: proposalId, p_decision: decision })
  if (error || !proposal) throw error ?? new Error("Proposal unavailable")
  if (proposal.project_id !== context.project.id || proposal.user_id !== context.user.id) throw new Error("Proposal does not belong to this project")
  if (decision === "rejected") {
    await audit(context, "tool.proposal_rejected", "creator_action_proposals", proposalId, { tool: proposal.action_type })
    return { proposal, executed: false }
  }
  const tool = directorTools[proposal.action_type as DirectorToolName]
  if (!tool) throw new Error("Unknown proposal action")
  try {
    const input = tool.input.parse(proposal.payload)
    const data = await tool.execute(context, input as never)
    await context.supabase.rpc("creator_finish_action_proposal", { p_proposal_id: proposalId, p_status: "executed" })
    if (proposal.tool_execution_id) await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: proposal.tool_execution_id, p_status: "completed", p_output: data, p_error: null })
    await audit(context, "tool.proposal_executed", "creator_action_proposals", proposalId, { tool: tool.name })
    return { proposal, executed: true, data }
  } catch (cause) {
    await context.supabase.rpc("creator_finish_action_proposal", { p_proposal_id: proposalId, p_status: "failed" })
    if (proposal.tool_execution_id) await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: proposal.tool_execution_id, p_status: "failed", p_output: null, p_error: { message: cause instanceof Error ? cause.message : "Tool failed" } })
    throw cause
  }
}

async function audit(context: AuthenticatedProjectContext, eventType: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  const { error } = await context.supabase.from("creator_audit_events").insert({ project_id: context.project.id, user_id: context.user.id, actor_type: "user", event_type: eventType, entity_type: entityType, entity_id: entityId, details })
  if (error) throw error
}
