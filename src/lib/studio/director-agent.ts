import { z } from "zod"
import { createDirectorToolTurn, streamDirectorToolTurn, type OpenAIDirectorFunction } from "./openai"
import { createGoogleDirectorToolTurn } from "./google"
import { directorTools, type DirectorToolName } from "./tool-registry"
import { requestDirectorTool } from "./tool-service"
import type { AuthenticatedProjectContext } from "./server-context"
import type { DirectorTimelineBlock } from "./timeline"
import { defaultDirectorRuntimeSettings, runtimeInstructions, type DirectorRuntimeSettings } from "./director-runtime-settings"
import { buildVisionUserContent, type DirectorVisionAttachment } from "./director-vision"
import { activeAgentInstructions, agentBriefFor, agentForStage, agentForTool, fetchDirectorTeam, type DirectorAgentKey, type DirectorTeam } from "./director-team"
import { addWorkflowStep, createWorkflowRun, finishWorkflowRun } from "./workflow-runs"
import { directorRecovery } from "./recovery"

export type DirectorStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; label: string; status: string; agent?: string }
  | { type: "proposal"; proposalId: string; title: string }

const toolDescriptions: Record<DirectorToolName, string> = {
  inspect_current_project: "Read the current project settings and creative brief.",
  read_episode_script: "Read the complete saved script for one episode. Use this when the user refers to the script already added in the Studio.",
  save_script_prompts: "Save the prompt sheet for the whole script: one prompt per shot, in order. Overwrites the episode's existing sheet",
  write_episode_master_prompt: "Write the episode's master scene prompt from the saved script — one document for the whole episode, in the saved Seedance format: image references, the CHARACTER / ASSET LOCK, setting and atmosphere, the full timed timeline, consistency rules, negative rules, production notes. This is the source every other prompt in the production is extracted from, so write it before creating characters, storyboard shots, or video prompts. It is stored exactly as written and is never sent to a generation provider as-is.",
  read_episode_master_prompt: "Read the episode's master scene prompt. Read it before extracting anything: characters and assets come from its CHARACTER / ASSET LOCK, each shot's image prompt and video prompt come from its timeline. A shot's image prompt is ONE FRAME — a single paragraph describing what the camera sees in one instant of that shot, in your own words, not a copy of the master prompt's SETTING / TIMELINE / CONSISTENCY / NEGATIVE / PRODUCTION NOTES sections and not more than one timed beat. create_storyboard_batch and update_shot both reject a prompt that reads like a whole scene. Never copy the lock block into a shot's image or video prompt either — a shot names characters by @tag only, because written appearance overrides their reference art and makes the character's look change between shots.",
  read_script_prompts: "Read the saved prompt sheet for an episode before building shots or generating",
  search_episode_script: "Read a bounded script line range or search it by keyword, character, or scene label.",
  list_production_entities: "List existing production entities with pagination and optional type or name filters. Use before creating entities to avoid duplicates.",
  list_storyboard_shots: "List storyboard shots for an episode with pagination. Each row carries `number`, the 1-based shot number shown in the storyboard. When the user names a shot or scene by number, match it against `number`, never against the 0-based `order_index`.",
  update_creative_brief: "Propose an update to the saved project creative brief.",
  create_series: "Propose creation of a series in the current project.",
  write_series_bible: "Propose an update to a saved series bible.",
  create_production_entity: "Propose creation of a character, location, prop, product, wardrobe, or voice asset. Use this when a shot prompt references an asset the project does not have yet. After it is approved, generate a reference image for it so later shots can use it as a visual reference, drawing on existing project assets so the look stays consistent.",
  create_production_entities_batch: "Propose creating up to 50 deduplicated production entities after inspecting existing entities.",
  create_storyboard_batch: "Propose creating or replacing an ordered storyboard batch with validated entity references. Each shot's prompt is one frame — a single paragraph of what the camera sees in that one moment — never the master prompt's own section headings and never more than one timed beat; a prompt that reads as a whole scene is rejected.",
  validate_production: "Validate storyboard prompts and entity references before generation.",
  record_continuity_fact: "Propose a scoped continuity fact for the production.",
  inspect_continuity: "Read approved continuity facts and conflicts.",
  estimate_generation_cost: "Estimate image or video generation credits and routing.",
  inspect_generation_jobs: "Read recent generation job states, results, and failures for this project or episode.",
  generate_entity_reference_art: "Generate reference art for named characters, locations, or props. Use this whenever the subject is an entity in the library rather than a storyboard shot — a character portrait or turnaround, a prop image, a location plate. Pass the entity ids from list_production_entities. It does not need a script or a prompt sheet: an entity's saved description is enough to draw it. Costly, so it raises an approval card before anything is charged.",
  submit_generation: "Propose image or video generation jobs. This always requires user approval. When the user names shots or scenes by number, pass those numbers as `request.shotNumbers` with `request.episodeId` and key `prompts` by the same numbers; the server resolves them to the correct shots. Use `request.shotIds` only for ids you read from a tool result. Include only the shots the user actually asked for, and never widen the request to neighbouring shots or to every shot missing media. Do not attach a shot's existing keyframe as a reference: a regenerate should build from the entity references and the prompt, not re-derive the picture it is replacing. Set `request.useExistingFrame` to true only when the user asks to keep the current composition, framing, or layout. Before submitting, check the prompt's @mentions against `list_production_entities`: if one names an asset the project does not have, do not submit with the dangling reference. Offer to create it with `create_production_entity` and generate its reference image, using existing characters and assets as visual reference, then submit once it exists — or ask the user which existing asset to use instead.",
  update_script: "Propose replacing or updating the saved episode script. Provide content as an object { title, overview, body, scenes?: [...] } where body contains the complete script text with scene headings, action, dialogue, and timestamps so it displays directly in the Script tab.",
  fix_shot_aspect_mismatch: "Fix every shot in an episode whose prompt states an aspect ratio (e.g. '16:9 cinematic shot') that disagrees with the shot's own aspect_ratio setting — the usual cause is the project's aspect being changed after the storyboard was written. One proposal corrects the whole episode. Use this whenever the user reports the wrong aspect being generated, or a prompt that names a different ratio than the shot is set to; it rewrites the stored prompt text itself, not just what is sent to the provider, so the storyboard shows the corrected wording.",
  update_shot: "Propose edits to one storyboard shot. `patch.prompt` is the image prompt the keyframe is drawn from — one frame, one paragraph, never the master prompt's own sections or more than one timed beat. `patch.video_prompt` is the timed beats the clip is filmed from. They are separate pieces of writing for separate models — setting one never touches the other. Use this to revise one shot the user is unhappy with; read the shot first with list_storyboard_shots and change what they asked about rather than rewriting the whole thing.",
  write_shot_video_prompts: "Write or revise the video prompts a storyboard is filmed from — the timed beats of what happens across each shot, one entry per shot, in one approval for the whole episode. This is separate from a shot's image prompt, which describes a single frame for the keyframe and must not be replaced with beats. Read the saved shots first with list_storyboard_shots and work from each shot's own prompt and script text. The runtime is taken from the beats themselves, so the last beat ends where the shot should end. When a prompt already exists it is shown as `video_prompt` on each shot: read it and revise what the user objected to, keeping what they liked, rather than writing a fresh one over the top. Follow the Prompt Agent's saved Seedance format for the writing itself; the timed beats are the one structure this tool requires.",
  delete_shot: "Propose deletion of one storyboard shot.",
  update_asset: "Propose edits to one saved production asset.",
  attach_media_to_asset: "Propose attaching uploaded or generated media to an asset.",
  delete_asset: "Propose deletion of one production asset.",
  attach_media_to_shot: "Propose attaching media to a storyboard shot.",
  update_full_auto_mode: "Propose changing guarded full-auto settings.",
  create_revision_request: "Propose a structured production revision request.",
}

// What the user sees on a timeline row or approval card. Kept separate from
// toolDescriptions, which is written for the model and states schema limits
// like "up to 50" that read as intent when shown as a label.
const toolLabels: Record<DirectorToolName, string> = {
  inspect_current_project: "Read project settings",
  read_episode_script: "Read the episode script",
  save_script_prompts: "Save the prompt sheet",
  write_episode_master_prompt: "Write the episode master prompt",
  read_episode_master_prompt: "Read the episode master prompt",
  read_script_prompts: "Read the prompt sheet",
  search_episode_script: "Search the script",
  list_production_entities: "List characters and assets",
  list_storyboard_shots: "List storyboard shots",
  update_creative_brief: "Update the creative brief",
  create_series: "Create a series",
  write_series_bible: "Write the series bible",
  create_production_entity: "Create a production asset",
  create_production_entities_batch: "Create production assets",
  create_storyboard_batch: "Build the storyboard",
  validate_production: "Validate the production",
  record_continuity_fact: "Record a continuity fact",
  inspect_continuity: "Read continuity facts",
  estimate_generation_cost: "Estimate generation cost",
  inspect_generation_jobs: "Check generation jobs",
  generate_entity_reference_art: "Generate reference art",
  submit_generation: "Generate media",
  update_script: "Update the script",
  update_shot: "Update a shot",
  fix_shot_aspect_mismatch: "Fix shot aspect mismatches",
  write_shot_video_prompts: "Write the shot video prompts",
  delete_shot: "Delete a shot",
  update_asset: "Update an asset",
  attach_media_to_asset: "Attach media to an asset",
  delete_asset: "Delete an asset",
  attach_media_to_shot: "Attach media to a shot",
  update_full_auto_mode: "Change full-auto settings",
  create_revision_request: "Create a revision request",
}

// A batch tool says far more when it reports how many items it is acting on
// than when it repeats its own name.
function toolLabel(name: DirectorToolName, args: unknown) {
  const label = toolLabels[name]
  if (!args || typeof args !== "object") return label
  const record = args as Record<string, unknown>
  const countable = ["entities", "shots", "shotIds", "shotNumbers", "prompts"]
  for (const key of countable) {
    const value = record[key]
    const count = Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0
    if (count > 0) return `${label} (${count})`
  }
  return label
}

export function directorFunctionDefinitions(only?: readonly DirectorToolName[]): OpenAIDirectorFunction[] {
  const names = only ?? (Object.keys(directorTools) as DirectorToolName[])
  return names.map((name) => ({
    name,
    description: toolDescriptions[name],
    parameters: z.toJSONSchema(directorTools[name].input, { target: "draft-7" }) as Record<string, unknown>,
  }))
}

export const HAND_OFF_TOOL = "hand_off_to_agent"
export const ASK_AGENT_TOOL = "ask_agent"

/**
 * The two tools that move work between agents rather than changing the
 * workspace. They are answered inside the loop, so they never reach the tool
 * service: no execution row, no approval card, nothing to spend.
 */
const controlToolDefinitions: OpenAIDirectorFunction[] = [
  {
    name: HAND_OFF_TOOL,
    description: "Hand this turn to another agent on the team when the work belongs to them and they should answer the user. They take over in this same reply, so hand over rather than describing what they would do. Pass a brief saying what they are being asked for and what has already been decided. Do not hand over work you can do yourself, and do not hand back and forth.",
    parameters: {
      type: "object",
      properties: {
        agent_key: { type: "string", description: "The key of the agent taking over, from the team list in your instructions." },
        brief: { type: "string", description: "What they are being asked for, and the decisions already made." },
      },
      required: ["agent_key"],
    },
  },
  {
    name: ASK_AGENT_TOOL,
    description: "Ask another agent on the team a question when you need something they would know and the work stays yours. They answer from their own brief and can read the workspace, but cannot change it. Use this instead of handing over when you only need an answer. Say everything they need in the question — they cannot see this conversation.",
    parameters: {
      type: "object",
      properties: {
        agent_key: { type: "string", description: "The key of the agent being asked, from the team list in your instructions." },
        question: { type: "string", description: "The question, stated so it can be answered without seeing this conversation." },
        context: { type: "string", description: "Anything they need to know to answer it." },
      },
      required: ["agent_key", "question"],
    },
  },
]

/** Read-only tools: the whole surface a consulted agent is allowed to touch. */
const readOnlyToolNames = (Object.keys(directorTools) as DirectorToolName[]).filter((name) => directorTools[name].risk === "read")

/**
 * What the agent holding this turn can reach: everything read-only, whatever
 * its own role owns, and the tools no role claims. Sending all thirty-odd on
 * every step cost ten thousand tokens a call and offered the Script Agent the
 * video renderer.
 */
function toolsForAgent(active: DirectorAgentKey | null): DirectorToolName[] {
  const all = Object.keys(directorTools) as DirectorToolName[]
  if (!active) return all
  return all.filter((name) => {
    if (directorTools[name].risk === "read") return true
    const owner = agentForTool(name)
    return !owner || owner === active
  })
}

export async function runDirectorAgent(input: {
  context: AuthenticatedProjectContext
  model: string
  /** The half that is identical on every turn, so the provider can cache it. */
  instructions: string
  /**
   * The half that changes as the production does — the state summary, the other
   * episodes' footage, this session's uploads. Kept apart from `instructions`
   * and placed after it so a workspace write invalidates only this block.
   */
  projectState?: string
  messages: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }>
  sessionId: string
  idempotencyKey: string
  runtimeSettings?: DirectorRuntimeSettings
  episodeId?: string
  objective: string
  visionAttachments?: DirectorVisionAttachment[]
  team?: DirectorTeam
  /**
   * The pipeline stage the workspace is on, used to pick which specialist opens
   * the turn. Read from the database, not from the user's wording.
   */
  stageKey?: string
  workflowRunId?: string
  // Reports progress while the run is still in flight so the chat can show text
  // and tool activity as they happen instead of after the whole loop finishes.
  onEvent?: (event: DirectorStreamEvent) => void
}) {
  const emit = (event: DirectorStreamEvent) => { try { input.onEvent?.(event) } catch { /* a broken consumer must not fail the run */ } }
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
  const workflowRun = input.workflowRunId
    ? { id: input.workflowRunId }
    : await createWorkflowRun(input.context, { episodeId: input.episodeId, sessionId: input.sessionId, objective: input.objective, maxSteps: runtimeSettings.maxToolSteps })
  let completedSteps = 0
  let failedSteps = 0
  let awaitingApproval = 0
  let stepSequence = 0
  let reachedStepLimit = false
  // The named agent team is the single source of specialist guidance. It travels
  // on every run, so behavior never depends on keywords in the user's message.
  const team = input.team || await fetchDirectorTeam(input.context.supabase)
  // The turn opens as the specialist whose stage the workspace is actually on,
  // read from the database rather than from the user's wording. It is a
  // starting point: hand_off_to_agent moves it, and the model decides when.
  let activeAgent: DirectorAgentKey | null = agentForStage(input.stageKey || "")
  if (activeAgent && !team[activeAgent].enabled) activeAgent = null
  let handoffs = 0
  let consultations = 0
  // Stable first, volatile last.
  //
  // Everything down to the project brief is the same on every turn of every
  // session, and the provider caches on a prefix match — so putting the project
  // state, which changes the moment a shot or an asset is written, ahead of the
  // team block meant each write threw away the cache for all six agent briefs
  // behind it. That is the largest fixed cost in the run, re-paid on every step
  // of the tool loop.
  //
  // There used to be a third block here, built by reading shot numbers out of
  // the user's message with a regex and forbidding the model to touch anything
  // else. It guessed, and when it guessed wrong it forbade the very thing being
  // asked for. The model reads the request itself now.
  // Rebuilt each step because the agent holding the turn can change mid-loop,
  // and its brief and its tools change with it — the same shape the brand chat
  // already uses for its handovers.
  const instructionsFor = () => [
    activeAgentInstructions(team, activeAgent),
    runtimeInstructions(runtimeSettings),
    "Executable workspace proposals must be created by calling the appropriate tool; never represent an executable proposal only as assistant text. Tool calls that require approval create the UI approval card and do not apply the change until the user approves it.",
    input.instructions,
    `Current episode ID: ${input.episodeId || "No episode selected"}`,
    `Current project ID: ${input.context.project.id}`,
    input.projectState || "",
  ].filter(Boolean).join("\n\n")

  for (let step = 0; step < runtimeSettings.maxToolSteps; step += 1) {
    let turn: Awaited<ReturnType<typeof createDirectorToolTurn>>
    try {
      const fullInstructions = instructionsFor()
      const toolDefs = [
        ...directorFunctionDefinitions(toolsForAgent(activeAgent)),
        ...controlToolDefinitions.filter((tool) => tool.name !== HAND_OFF_TOOL || handoffs < runtimeSettings.maxHandoffs),
      ]

      turn = input.model.startsWith("gemini")
        ? await createGoogleDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: fullInstructions,
            items,
            tools: toolDefs,
          })
        : input.onEvent
        ? await streamDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: fullInstructions,
            items,
            tools: toolDefs,
            onTextDelta: (delta) => emit({ type: "text", delta }),
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

    // Record every call of this batch before any output. Gemini requires a
    // parallel batch to be replayed as one model turn, and keeping calls and
    // outputs unmixed is what lets the replay tell a parallel batch apart from
    // the next sequential step.
    for (const call of turn.calls) {
      items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
    }

    for (const call of turn.calls) {
      stepSequence += 1

      // Moving work between agents is loop control, not a workspace change, so
      // it is answered here: no execution row, no approval card, nothing spent.
      if (call.name === HAND_OFF_TOOL || call.name === ASK_AGENT_TOOL) {
        const args = (call.arguments || {}) as Record<string, unknown>
        const targetKey = typeof args.agent_key === "string" ? args.agent_key as DirectorAgentKey : null
        const target = targetKey && team[targetKey]?.enabled ? targetKey : null
        const reply = (output: Record<string, unknown>) =>
          items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output), thoughtSignature: call.thoughtSignature })

        // A key nobody answers to is the model inventing a colleague. Told
        // plainly, it does the work itself; thrown, it would lose the turn.
        if (!target || target === activeAgent) {
          reply({ error: `There is no other agent called "${String(args.agent_key ?? "")}" on this team. Do the work yourself.` })
          continue
        }

        if (call.name === HAND_OFF_TOOL) {
          if (handoffs >= runtimeSettings.maxHandoffs) {
            reply({ error: "You have handed this turn over as many times as it allows. Finish the work yourself and hand back to the user." })
            continue
          }
          handoffs += 1
          const from = activeAgent ? team[activeAgent].name : "The Director"
          activeAgent = target
          const brief = typeof args.brief === "string" ? args.brief : ""
          emit({ type: "tool", tool: call.name, label: `${from} → ${team[target].name}`, status: "completed", agent: team[target].name })
          timeline.push({ type: "tool_execution", tool: call.name, label: `${from} handed this to ${team[target].name}`, status: "completed", agent: team[target].name })
          // The brief is replayed as the instruction the new agent answers, so
          // it starts from what was decided rather than from nothing.
          reply({ from, to: team[target].name, brief, note: `You are now the ${team[target].name}. Answer the user directly from the brief. Do not introduce yourself or restate the handover.` })
          continue
        }

        if (consultations >= runtimeSettings.maxConsultations) {
          reply({ error: "You have asked your colleagues as many questions as this turn allows. Answer from what you already have." })
          continue
        }
        consultations += 1
        const question = typeof args.question === "string" ? args.question : ""
        const extra = typeof args.context === "string" ? args.context : ""
        emit({ type: "tool", tool: call.name, label: `Asked ${team[target].name}`, status: "running", agent: team[target].name })
        try {
          // A separate call with the colleague's own brief and read-only tools.
          // Control stays here — the asking agent carries on with its own
          // context intact — and read-only is the boundary that makes a
          // consultation safe to run without asking the user anything.
          const consulted = await createDirectorToolTurn({
            userId: input.context.user.id,
            model: input.model,
            instructions: [
              agentBriefFor(team, target),
              "A colleague has asked you a question about this production. Answer it from your own expertise and from what you can read in the workspace. You may read, but you cannot change anything and must not offer to. Answer only what was asked, in a few sentences.",
              `Current episode ID: ${input.episodeId || "No episode selected"}`,
              `Current project ID: ${input.context.project.id}`,
              input.projectState || "",
            ].filter(Boolean).join("\n\n"),
            items: [{ role: "user", content: [question, extra].filter(Boolean).join("\n\n") }],
            tools: directorFunctionDefinitions(readOnlyToolNames),
          })
          const answer = consulted.content?.trim() || "They had no answer to add."
          timeline.push({ type: "tool_execution", tool: call.name, label: `Asked ${team[target].name}`, status: "completed", agent: team[target].name, detail: answer.slice(0, 4_000) })
          emit({ type: "tool", tool: call.name, label: `Asked ${team[target].name}`, status: "completed", agent: team[target].name })
          reply({ from: team[target].name, answer })
        } catch (error) {
          // A colleague who cannot answer must not lose the turn: the agent
          // that asked still has its own work to finish.
          const message = directorRecovery(error).message
          emit({ type: "tool", tool: call.name, label: `Asked ${team[target].name}`, status: "failed", agent: team[target].name })
          reply({ error: `${team[target].name} could not answer: ${message}. Carry on without them.` })
        }
        continue
      }

      const tool = directorTools[call.name as DirectorToolName]
      if (!tool) {
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: "Unknown Director tool" }), thoughtSignature: call.thoughtSignature })
        continue
      }
      const label = toolLabel(call.name as DirectorToolName, call.arguments)
      // Name the agent that owns this tool so a handoff is visible in chat under
      // whatever the admin renamed that agent to.
      const owningAgent = agentForTool(call.name)
      const agentName = owningAgent && team[owningAgent].enabled ? team[owningAgent].name : undefined
      const block: DirectorTimelineBlock = { type: "tool_execution", tool: call.name, label, status: "running", agent: agentName }
      timeline.push(block)
      emit({ type: "tool", tool: call.name, label, status: "running", agent: agentName })
      try {
        const result = await requestDirectorTool(input.context, {
          tool: call.name,
          input: call.arguments,
          sessionId: input.sessionId,
          workflowRunId: workflowRun.id,
          idempotencyKey: `${input.idempotencyKey}:${step}:${call.callId}`,
        })
        block.status = result.approvalRequired ? "awaiting_approval" : "completed"
        block.executionId = result.executionId || result.execution?.id
        toolCalls.push({ tool: call.name, callId: call.callId, result })
        if (result.proposal) {
          timeline.push({ type: "proposal", proposalId: result.proposal.id, title: result.proposal.title })
          suggestedActions.push({ type: "proposal", proposal: result.proposal })
          // Announced the instant it exists. The run may still have steps left,
          // and waiting for the whole loop to finish before showing an approval
          // card is most of the delay between asking and being able to act.
          emit({ type: "proposal", proposalId: result.proposal.id, title: result.proposal.title })
        }
        await addWorkflowStep(input.context, { runId: workflowRun.id, sequence: stepSequence, specialist: activeAgent || specialistForTool(call.name), label, status: block.status, toolExecutionId: block.executionId, toolInput: call.arguments, output: result })
        if (block.status === "completed") completedSteps += 1
        if (block.status === "awaiting_approval") awaitingApproval += 1
        emit({ type: "tool", tool: call.name, label, status: block.status, agent: agentName })
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(result), thoughtSignature: call.thoughtSignature })
      } catch (error) {
        const recovery = directorRecovery(error)
        const message = recovery.message
        block.status = "failed"
        block.error = message
        failedSteps += 1
        await addWorkflowStep(input.context, { runId: workflowRun.id, sequence: stepSequence, specialist: activeAgent || specialistForTool(call.name), label, status: "failed", toolInput: call.arguments, error: { message } })
        emit({ type: "tool", tool: call.name, label, status: "failed", agent: agentName })
        items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: message }), thoughtSignature: call.thoughtSignature })
        timeline.push({ type: "warning", code: recovery.code, message: recovery.message, recoverable: recovery.recoverable, actions: recovery.suggestedIntent && recovery.suggestedLabel ? [{ id: `recover-${stepSequence}`, label: recovery.suggestedLabel, intent: recovery.suggestedIntent, payload: {}, risk: "read", recommended: true }] : [] })
      }
    }
  }

  if (!content) content = timeline.length ? "I completed the available workflow steps. Review any approval cards before I continue." : "I could not complete that request. Please try a more specific instruction."
  const finalStatus = failedSteps || reachedStepLimit ? (completedSteps || awaitingApproval ? "partially_completed" : "failed") : awaitingApproval ? "awaiting_approval" : "completed"
  await finishWorkflowRun(input.context, workflowRun.id, finalStatus, { completedSteps, failedSteps, awaitingApproval, toolCalls: toolCalls.length })
  timeline.unshift({ type: "workflow_summary", title: "Director workflow", summary: finalStatus === "completed" ? "Workflow completed." : finalStatus === "awaiting_approval" ? "Workflow is waiting for your approval." : "Workflow completed with items that need attention.", completed: completedSteps, failed: failedSteps })
  if (reachedStepLimit) timeline.push({ type: "warning", code: "step_limit", message: `This workflow reached the configured limit of ${runtimeSettings.maxToolSteps} tool turns. Continue it in a new message if more work remains.`, recoverable: true, actions: [{ id: "continue-workflow", label: "Continue workflow", intent: "Continue the previous workflow from its latest checkpoint", payload: { workflowRunId: workflowRun.id }, risk: "read", recommended: true }] })
  // The next step is appended by the caller from the pipeline state left behind
  // by this run, so the button offers the stage the workspace is actually on
  // rather than a guess made from which tools happened to be called.
  return { content, timeline, suggestedActions, toolCalls, usage, workflowRunId: workflowRun.id }
}

function specialistForTool(name: string) {
  // Workflow steps are attributed to the owning team agent, so the timeline
  // shows which agent performed the work rather than a substring guess.
  return agentForTool(name) ?? "orchestrator"
}
