import { z } from "zod"
import { createDirectorToolTurn, type OpenAIDirectorFunction } from "./openai"
import { createGoogleDirectorToolTurn } from "./google"
import { createBytePlusDirectorToolTurn } from "./byteplus"
import { directorTools, type DirectorToolName } from "./tool-registry"
import { requestDirectorTool } from "./tool-service"
import type { AuthenticatedProjectContext } from "./server-context"
import type { DirectorTimelineBlock } from "./timeline"
import { defaultDirectorRuntimeSettings, runtimeInstructions, type DirectorRuntimeSettings, type SpecialistInstructionKey } from "./director-runtime-settings"
import { buildVisionUserContent, type DirectorVisionAttachment } from "./director-vision"
import { agentForTool, fetchDirectorTeam, teamInstructions, type DirectorTeam } from "./director-team"
import { addWorkflowStep, createWorkflowRun, finishWorkflowRun } from "./workflow-runs"
import { directorRecovery } from "./recovery"

const toolDescriptions: Record<DirectorToolName, string> = {
  inspect_current_project: "Read the current project settings and creative brief.",
  read_episode_script: "Read the complete saved script for one episode. Use this when the user refers to the script already added in the Studio.",
  save_script_prompts: "Save the prompt sheet for the whole script: one prompt per shot, in order. Overwrites the episode's existing sheet",
  read_script_prompts: "Read the saved prompt sheet for an episode before building shots or generating",
  search_episode_script: "Read a bounded script line range or search it by keyword, character, or scene label.",
  list_production_entities: "List existing production entities with pagination and optional type or name filters. Use before creating entities to avoid duplicates.",
  list_storyboard_shots: "List storyboard shots for an episode with pagination.",
  update_creative_brief: "Propose an update to the saved project creative brief.",
  create_series: "Propose creation of a series in the current project.",
  write_series_bible: "Propose an update to a saved series bible.",
  create_production_entity: "Propose creation of a character, location, prop, product, wardrobe, or voice asset.",
  create_production_entities_batch: "Propose creating up to 50 deduplicated production entities after inspecting existing entities.",
  create_storyboard_batch: "Propose creating or replacing an ordered storyboard batch with validated entity references.",
  validate_production: "Validate storyboard prompts and entity references before generation.",
  record_continuity_fact: "Propose a scoped continuity fact for the production.",
  inspect_continuity: "Read approved continuity facts and conflicts.",
  estimate_generation_cost: "Estimate image or video generation credits and routing.",
  inspect_generation_jobs: "Read recent generation job states, results, and failures for this project or episode.",
  submit_generation: "Propose image or video generation jobs. This always requires user approval.",
  update_script: "Propose replacing the saved episode script content.",
  update_shot: "Propose edits to one storyboard shot.",
  delete_shot: "Propose deletion of one storyboard shot.",
  update_asset: "Propose edits to one saved production asset.",
  attach_media_to_asset: "Propose attaching uploaded or generated media to an asset.",
  delete_asset: "Propose deletion of one production asset.",
  attach_media_to_shot: "Propose attaching media to a storyboard shot.",
  update_full_auto_mode: "Propose changing guarded full-auto settings.",
  create_revision_request: "Propose a structured production revision request.",
}

export function directorFunctionDefinitions(): OpenAIDirectorFunction[] {
  return (Object.keys(directorTools) as DirectorToolName[]).map((name) => ({
    name,
    description: toolDescriptions[name],
    parameters: z.toJSONSchema(directorTools[name].input, { target: "draft-7" }) as Record<string, unknown>,
  }))
}

export async function runDirectorAgent(input: {
  context: AuthenticatedProjectContext
  model: string
  instructions: string
  messages: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }>
  sessionId: string
  idempotencyKey: string
  runtimeSettings?: DirectorRuntimeSettings
  episodeId?: string
  objective: string
  visionAttachments?: DirectorVisionAttachment[]
  team?: DirectorTeam
}) {
  const runtimeSettings = input.runtimeSettings || defaultDirectorRuntimeSettings
  const items: Array<Record<string, unknown>> = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }))
  // Attach workspace images to the latest user turn so the Director looks at the
  // references instead of reasoning from storage paths it cannot open.
  const attachments = input.visionAttachments || []
  if (attachments.length) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].role !== "user") continue
      items[index] = { role: "user", content: buildVisionUserContent(String(items[index].content ?? ""), attachments) }
      break
    }
  }
  const timeline: DirectorTimelineBlock[] = []
  const suggestedActions: Array<Record<string, unknown>> = []
  const toolCalls: Array<Record<string, unknown>> = []
  let content = ""
  let usage: Record<string, unknown> = {}
  const workflowRun = await createWorkflowRun(input.context, { episodeId: input.episodeId, sessionId: input.sessionId, objective: input.objective, maxSteps: runtimeSettings.maxToolSteps })
  let completedSteps = 0
  let failedSteps = 0
  let awaitingApproval = 0
  let stepSequence = 0
  let reachedStepLimit = false
  const activeSpecialists = selectSpecialists(input.objective)
  // The agent team travels on every run. Regex specialist selection only decides
  // which legacy specialist notes are appended; the team block is complete, so
  // agent guidance no longer depends on which words the user happened to use.
  const team = input.team || await fetchDirectorTeam(input.context.supabase)
  const teamBlock = teamInstructions(team)

  for (let step = 0; step < runtimeSettings.maxToolSteps; step += 1) {
    let turn: Awaited<ReturnType<typeof createDirectorToolTurn>>
    try {
      const fullInstructions = `${input.instructions}\nCurrent episode ID: ${input.episodeId || "No episode selected"}\nCurrent project ID: ${input.context.project.id}\nExecutable workspace proposals must be created by calling the appropriate tool; never represent an executable proposal only as assistant text. Tool calls that require approval create the UI approval card and do not apply the change until the user approves it.\n\n${teamBlock}\n\n${runtimeInstructions(runtimeSettings, activeSpecialists)}`
      const toolDefs = directorFunctionDefinitions()

      const isBytePlus = input.model === "kimi-2.5" || input.model === "deepseek-v4" || input.model === "glm-5.2" || input.model === "dola-seed-2-1-turbo" || input.model === "dola-seed-2-0"

      turn = input.model.startsWith("gemini")
        ? await createGoogleDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: fullInstructions,
            items,
            tools: toolDefs,
          })
        : isBytePlus
        ? await createBytePlusDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: fullInstructions,
            items,
            tools: toolDefs,
          })
        : await createDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: fullInstructions,
            items,
            tools: toolDefs,
          })
    } catch (error) {
      const recovery = directorRecovery(error)
      await finishWorkflowRun(input.context, workflowRun.id, "failed", { completedSteps, failedSteps: failedSteps + 1, awaitingApproval, toolCalls: toolCalls.length }, { code: recovery.code, message: recovery.message })
      throw error
    }
    usage = turn.usage
    if (turn.content) content = turn.content
    if (!turn.calls.length) break
    if (step === runtimeSettings.maxToolSteps - 1) reachedStepLimit = true

    for (const call of turn.calls) {
      stepSequence += 1
      const tool = directorTools[call.name as DirectorToolName]
      if (!tool) {
        items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: "Unknown Director tool" }), thoughtSignature: call.thoughtSignature })
        continue
      }
      const label = toolDescriptions[call.name as DirectorToolName].replace(/[.]$/, "")
      // Name the agent that owns this tool so a handoff is visible in chat under
      // whatever the admin renamed that agent to.
      const owningAgent = agentForTool(call.name)
      const agentName = owningAgent && team[owningAgent].enabled ? team[owningAgent].name : undefined
      const block: DirectorTimelineBlock = { type: "tool_execution", tool: call.name, label, status: "running", agent: agentName }
      timeline.push(block)
      items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
      try {
        const result = await requestDirectorTool(input.context, {
          tool: call.name,
          input: call.arguments,
          sessionId: input.sessionId,
          idempotencyKey: `${input.idempotencyKey}:${step}:${call.callId}`,
        })
        block.status = result.approvalRequired ? "awaiting_approval" : "completed"
        block.executionId = result.executionId || result.execution?.id
        toolCalls.push({ tool: call.name, callId: call.callId, result })
        if (result.proposal) {
          timeline.push({ type: "proposal", proposalId: result.proposal.id, title: result.proposal.title })
          suggestedActions.push({ type: "proposal", proposal: result.proposal })
        }
        await addWorkflowStep(input.context, { runId: workflowRun.id, sequence: stepSequence, specialist: specialistForTool(call.name), label, status: block.status, toolExecutionId: block.executionId, toolInput: call.arguments, output: result })
        if (block.status === "completed") completedSteps += 1
        if (block.status === "awaiting_approval") awaitingApproval += 1
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(result), thoughtSignature: call.thoughtSignature })
      } catch (error) {
        const recovery = directorRecovery(error)
        const message = recovery.message
        block.status = "failed"
        block.error = message
        failedSteps += 1
        await addWorkflowStep(input.context, { runId: workflowRun.id, sequence: stepSequence, specialist: specialistForTool(call.name), label, status: "failed", toolInput: call.arguments, error: { message } })
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: message }), thoughtSignature: call.thoughtSignature })
        timeline.push({ type: "warning", code: recovery.code, message: recovery.message, recoverable: recovery.recoverable, actions: recovery.suggestedIntent && recovery.suggestedLabel ? [{ id: `recover-${stepSequence}`, label: recovery.suggestedLabel, intent: recovery.suggestedIntent, payload: {}, risk: "read", recommended: true }] : [] })
      }
    }
  }

  if (!content) content = timeline.length ? "I completed the available workflow steps. Review any approval cards before I continue." : "I could not complete that request. Please try a more specific instruction."
  const finalStatus = failedSteps || reachedStepLimit ? (completedSteps || awaitingApproval ? "partially_completed" : "failed") : awaitingApproval ? "awaiting_approval" : "completed"
  await finishWorkflowRun(input.context, workflowRun.id, finalStatus, { completedSteps, failedSteps, awaitingApproval, toolCalls: toolCalls.length })
  timeline.unshift({ type: "workflow_summary", title: "Director workflow", summary: finalStatus === "completed" ? "Workflow completed." : finalStatus === "awaiting_approval" ? "Workflow is waiting for your approval." : "Workflow completed with items that need attention.", completed: completedSteps, failed: failedSteps })
  const nextActions = buildNextActions({ finalStatus, toolCalls, limit: runtimeSettings.nextActionLimit })
  if (reachedStepLimit) timeline.push({ type: "warning", code: "step_limit", message: `This workflow reached the configured limit of ${runtimeSettings.maxToolSteps} tool turns. Continue it in a new message if more work remains.`, recoverable: true, actions: [{ id: "continue-workflow", label: "Continue workflow", intent: "Continue the previous workflow from its latest checkpoint", payload: { workflowRunId: workflowRun.id }, risk: "read", recommended: true }] })
  if (nextActions.length) timeline.push({ type: "suggested_actions", actions: nextActions })
  return { content, timeline, suggestedActions, toolCalls, usage, workflowRunId: workflowRun.id }
}

export function selectSpecialists(objective: string): SpecialistInstructionKey[] {
  const value = objective.toLowerCase()
  const selected = new Set<SpecialistInstructionKey>()
  if (/script|screenplay|scene text|dialogue/.test(value)) selected.add("script")
  if (/character|entity|entities|location|prop|asset/.test(value)) selected.add("entities")
  if (/storyboard|shot|segment|keyframe/.test(value)) selected.add("storyboard")
  if (/image|visual|video|generate|reference|keyframe/.test(value)) selected.add("visuals")
  if (/continuity|consistent|match|validate|review/.test(value)) selected.add("continuity")
  selected.add("recovery")
  return Array.from(selected)
}

function buildNextActions(input: { finalStatus: string; toolCalls: Array<Record<string, unknown>>; limit: number }) {
  const called = new Set(input.toolCalls.map((call) => call.tool))
  const actions: Array<{ id: string; label: string; intent: string; payload: Record<string, unknown>; risk: "read" | "write" | "costly" | "destructive"; recommended: boolean }> = []
  if (input.finalStatus === "awaiting_approval") actions.push({ id: "review-approvals", label: "Review and approve proposed changes", intent: "Show me the pending proposals and explain what each will change", payload: {}, risk: "read", recommended: true })
  if (called.has("read_episode_script") && !called.has("list_production_entities")) actions.push({ id: "inspect-entities", label: "Check existing characters, locations, and props", intent: "Inspect existing production entities and compare them with the saved script", payload: {}, risk: "read", recommended: actions.length === 0 })
  if (called.has("create_production_entities_batch")) actions.push({ id: "build-storyboard", label: "Create storyboard from the saved script", intent: "Validate the approved entities and propose an ordered storyboard from the saved script", payload: {}, risk: "write", recommended: actions.length === 0 })
  if (called.has("create_storyboard_batch") || called.has("list_storyboard_shots")) actions.push({ id: "validate-production", label: "Validate storyboard and references", intent: "Validate the current storyboard prompts and entity references before generation", payload: {}, risk: "read", recommended: actions.length === 0 })
  if (called.has("validate_production")) actions.push({ id: "generate-keyframes", label: "Prepare storyboard keyframes", intent: "Prepare image generation for the validated storyboard shots and show the approval and credit estimate", payload: {}, risk: "costly", recommended: actions.length === 0 })
  return actions.slice(0, input.limit)
}

function specialistForTool(name: string) {
  // Workflow steps are attributed to the owning team agent, so the timeline
  // shows which agent performed the work rather than a substring guess.
  return agentForTool(name) ?? "orchestrator"
}
