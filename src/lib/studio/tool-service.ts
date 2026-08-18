import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { directorTools, type DirectorToolName } from "./tool-registry"
import { getUserCredits } from "./credits"
import { stripIdentityDescriptionsFromPrompts } from "./prompt-sanitizer"
import { projectDirectorVideoModel } from "./generation-models"

// Read from the registry rather than written out again. A second copy of this
// list meant a tool could be registered, described, owned by an agent, and
// offered to the model, yet still be rejected here as "tool: Invalid input" —
// a failure that names the gate rather than the omission, and points at the
// model's arguments rather than at the list nobody remembered to update.
const directorToolNames = Object.keys(directorTools) as [DirectorToolName, ...DirectorToolName[]]

export const toolRequestSchema = z.object({
  tool: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().replaceAll(" ", "_") : val),
    z.enum(directorToolNames),
  ),
  input: z.unknown(),
  idempotencyKey: z.string().trim().min(8).max(200),
  sessionId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
})

function normalizeToolInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const rec = { ...(input as Record<string, unknown>) }
  if ("episode_id" in rec && !("episodeId" in rec)) rec.episodeId = rec.episode_id
  if ("project_id" in rec && !("projectId" in rec)) rec.projectId = rec.project_id
  if ("shot_id" in rec && !("shotId" in rec)) rec.shotId = rec.shot_id
  if ("asset_id" in rec && !("assetId" in rec)) rec.assetId = rec.asset_id
  if ("series_id" in rec && !("seriesId" in rec)) rec.seriesId = rec.series_id
  if ("workflow_run_id" in rec && !("workflowRunId" in rec)) rec.workflowRunId = rec.workflow_run_id
  return rec
}

export async function requestDirectorTool(context: AuthenticatedProjectContext, raw: unknown) {
  const request = toolRequestSchema.parse(raw)
  const tool = directorTools[request.tool]
  const preparedInput = request.tool === "submit_generation" && request.workflowRunId && request.input && typeof request.input === "object"
    ? { ...(request.input as Record<string, unknown>), workflowRunId: request.workflowRunId }
    : request.input
  const rawInput = normalizeToolInput(preparedInput)
  const parsedInput = tool.input.parse(rawInput)
  // Generation execution strips identity prose as a final safety check. Apply
  // the same rule before saving the approval proposal so the UI never shows a
  // CHARACTER / ASSET LOCK block that will not be sent to the provider.
  const input = request.tool === "submit_generation"
    && parsedInput
    && typeof parsedInput === "object"
    && "request" in parsedInput
    && "prompts" in parsedInput
    && parsedInput.request
    && typeof parsedInput.request === "object"
    && "type" in parsedInput.request
    && parsedInput.request.type === "video"
    && parsedInput.prompts
    && typeof parsedInput.prompts === "object"
    ? {
        ...parsedInput,
        request: {
          ...parsedInput.request,
          model: typeof parsedInput.request.model === "string" && parsedInput.request.model.trim()
            ? parsedInput.request.model
            : projectDirectorVideoModel(context.project),
        },
        prompts: stripIdentityDescriptionsFromPrompts(parsedInput.prompts as Record<string, string>),
      }
    : parsedInput

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
    workflow_run_id: request.workflowRunId ?? null,
    input,
  })
  if (executionError) throw executionError

  if (tool.requiresApproval) {
    const proposalCopy = await describeProposal(context, tool.name, input)
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
      workflow_run_id: request.workflowRunId ?? null,
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

async function describeProposal(context: AuthenticatedProjectContext, toolName: string, input: unknown) {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {}
  if (toolName === "submit_generation") {
    const request = payload.request && typeof payload.request === "object" ? payload.request as { type?: unknown; shotIds?: unknown; shotNumbers?: unknown } : {}
    const shotIds = Array.isArray(request.shotIds) ? request.shotIds : []
    const shotNumbers = Array.isArray(request.shotNumbers) ? request.shotNumbers : []
    const shotCount = shotIds.length || shotNumbers.length
    return {
      title: request.type === "video" ? "Generate storyboard video" : "Generate storyboard image",
      summary: `Review ${shotCount || 1} ${request.type === "video" ? "video" : "image"} generation job${shotCount === 1 ? "" : "s"}${shotNumbers.length ? ` for shot ${shotNumbers.join(", ")}` : ""} before credits are reserved.`,
      estimatedCredits: 0,
      affectedEntities: shotIds.map((id) => ({ type: "shot", id })),
    }
  }
  // A batch proposal is approved on what it will actually create, so name the
  // items rather than restating the tool. The schema maximum ("up to 50") is
  // guidance for the model and reads as intent on an approval card.
  const namedItems = (value: unknown) => {
    if (!Array.isArray(value)) return null
    const names = value
      .map((item) => (item && typeof item === "object" ? (item as { name?: unknown; title?: unknown }).name ?? (item as { title?: unknown }).title : null))
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    return names.length ? names : null
  }
  const batchNames = namedItems(payload.entities) || namedItems(payload.shots)
  if (batchNames) {
    const shown = batchNames.slice(0, 6).join(", ")
    const rest = batchNames.length > 6 ? ` and ${batchNames.length - 6} more` : ""
    const noun = payload.entities ? "asset" : "shot"
    return {
      title: payload.entities ? "Create production assets" : "Create storyboard shots",
      summary: `${batchNames.length} ${noun}${batchNames.length === 1 ? "" : "s"}: ${shown}${rest}.`,
      estimatedCredits: 0,
      affectedEntities: [],
    }
  }

  // An asset card that says only "Update asset" is unapprovable: the user is
  // being asked to accept a change to something the card will not name. Three
  // of them in a row, as a look revision produces, are indistinguishable.
  const assetId = typeof payload.assetId === "string" ? payload.assetId : ""
  if (assetId) {
    const patch = payload.patch && typeof payload.patch === "object" ? payload.patch as Record<string, unknown> : {}
    const { data: asset } = await context.supabase
      .from("creator_entities")
      .select("name")
      .eq("id", assetId)
      .eq("project_id", context.project.id)
      .maybeSingle()
    const name = typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : asset?.name || ""
    const changing = Object.keys(patch).map((field) => field.replace(/_/g, " ")).join(", ")
    if (name) {
      const deleting = toolName === "delete_asset"
      return {
        title: `${deleting ? "Delete" : "Update"} ${name}`,
        summary: deleting
          ? `This will remove ${name} and its reference art after approval.`
          : `Changes ${changing || "this asset"} on ${name}.`,
        estimatedCredits: 0,
        affectedEntities: [{ type: "asset", id: assetId }],
      }
    }
  }

  const titles: Record<string, string> = {
    update_creative_brief: "Update the creative brief",
    create_series: "Create series",
    write_series_bible: "Write series bible",
    create_production_entity: "Create asset",
    create_production_entities_batch: "Create production assets",
    create_storyboard_batch: "Create storyboard shots",
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

// Edits made in the chat generation block are merged one level deep so a card
// can send only the keys it changed (for example request.model) without having
// to restate the whole payload. The tool's own schema still validates the
// result, so an override can never widen what the tool accepts.
function mergeProposalPayload(payload: unknown, overrides: Record<string, unknown> | undefined) {
  if (!overrides || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const base = payload as Record<string, unknown>
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const current = base[key]
    const bothPlainObjects = value && typeof value === "object" && !Array.isArray(value)
      && current && typeof current === "object" && !Array.isArray(current)
    merged[key] = bothPlainObjects
      ? { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) }
      : value
  }
  return merged
}

export async function decideDirectorProposal(context: AuthenticatedProjectContext, proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) {
  const { data: proposal, error } = await context.supabase.rpc("creator_decide_action_proposal", { p_proposal_id: proposalId, p_decision: decision })
  if (error || !proposal) {
    // The RPC only says "proposal unavailable". Read the record to say which of
    // the several reasons it was: the card is usually just stale, and telling
    // the user it was already approved is the difference between an answer and
    // a Postgres error code.
    const { data: existing } = await context.supabase
      .from("creator_action_proposals").select("status,expires_at,user_id").eq("id", proposalId).maybeSingle()
    if (!existing) throw new Error("This proposal no longer exists. Ask the Director to prepare it again.")
    if (existing.user_id !== context.user.id) throw new Error("This proposal belongs to another account.")
    if (existing.status === "approved" || existing.status === "executed") {
      throw new Error("This generation was already approved and is running. Check the storyboard for its progress.")
    }
    if (existing.status === "rejected") throw new Error("This proposal was already cancelled.")
    if (existing.status === "failed") throw new Error("This proposal already ran and failed. Ask the Director to prepare it again.")
    if (existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now()) {
      throw new Error("This proposal expired. Ask the Director to prepare it again.")
    }
    throw error ?? new Error("Proposal unavailable")
  }
  if (proposal.project_id !== context.project.id || proposal.user_id !== context.user.id) throw new Error("Proposal does not belong to this project")
  if (decision === "rejected") {
    if (proposal.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "cancelled", completed_at: new Date().toISOString(), summary: { decision: "rejected", proposalId } }).eq("id", proposal.workflow_run_id)
    await audit(context, "tool.proposal_rejected", "creator_action_proposals", proposalId, { tool: proposal.action_type })
    return { proposal, executed: false, creditBalance: await getUserCredits(context.user.id, context.supabase) }
  }
  const tool = directorTools[proposal.action_type as DirectorToolName]
  if (!tool) throw new Error("Unknown proposal action")
  try {
    const payload = mergeProposalPayload(proposal.payload, overrides)
    const input = tool.input.parse(normalizeToolInput(payload))
    if (overrides && Object.keys(overrides).length) {
      // Bookkeeping only: execution already uses the merged payload above. A
      // failure here must not block work the user has approved and paid for.
      const { error: payloadError } = await context.supabase.from("creator_action_proposals").update({ payload }).eq("id", proposalId)
      if (payloadError) console.warn("Could not persist edited proposal payload:", payloadError.message)
      await audit(context, "tool.proposal_edited", "creator_action_proposals", proposalId, { tool: proposal.action_type, overrides })
    }
    const data = await tool.execute(context, input as never)
    await context.supabase.rpc("creator_finish_action_proposal", { p_proposal_id: proposalId, p_status: "executed" })
    if (proposal.tool_execution_id) await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: proposal.tool_execution_id, p_status: "completed", p_output: data, p_error: null })
    await audit(context, "tool.proposal_executed", "creator_action_proposals", proposalId, { tool: tool.name })
    if (proposal.workflow_run_id) {
      const generationContinues = proposal.action_type === "submit_generation"
      await context.supabase.from("creator_workflow_runs").update({
        status: generationContinues ? "running" : "completed",
        summary: { decision: "approved", proposalId, tool: tool.name, generationContinues },
        completed_at: generationContinues ? null : new Date().toISOString(),
      }).eq("id", proposal.workflow_run_id)
    }
    return { proposal, executed: true, data, creditBalance: await getUserCredits(context.user.id, context.supabase) }
  } catch (cause) {
    await context.supabase.rpc("creator_finish_action_proposal", { p_proposal_id: proposalId, p_status: "failed" })
    if (proposal.tool_execution_id) await context.supabase.rpc("creator_finish_tool_execution", { p_execution_id: proposal.tool_execution_id, p_status: "failed", p_output: null, p_error: { message: cause instanceof Error ? cause.message : "Tool failed" } })
    if (proposal.workflow_run_id) await context.supabase.from("creator_workflow_runs").update({ status: "failed", error: { message: cause instanceof Error ? cause.message : "Tool failed" }, completed_at: new Date().toISOString() }).eq("id", proposal.workflow_run_id)
    throw cause
  }
}

// Audit writes are a record of what happened, not a precondition for it. This
// runs after generation has been submitted and credits deducted, so a failed
// insert must be reported rather than thrown — throwing here marked a
// successful, paid generation as failed.
async function audit(context: AuthenticatedProjectContext, eventType: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  const { error } = await context.supabase.from("creator_audit_events").insert({ project_id: context.project.id, user_id: context.user.id, actor_type: "user", event_type: eventType, entity_type: entityType, entity_id: entityId, details })
  if (error) console.warn(`Could not record audit event ${eventType}:`, error.message)
}
