import { z } from "zod"
import { revisionRoutingInstructions } from "./revision-routing"
import type { ProjectContext } from "./domain"
import { defaultDirectorGlobalInstructions } from "./instructions"
import { serializeToolOutput } from "./tool-result-budget"

export const directorMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().max(50_000),
}).strict()

export type DirectorMessage = z.infer<typeof directorMessageSchema>

export type DirectorConversationRequest = {
  project: ProjectContext
  messages: DirectorMessage[]
  instructions: string
  providerConversationId?: string
}

export type DirectorConversationResponse = {
  content: string
  provider: string
  model: string
  providerResponseId: string
  providerConversationId?: string
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

export interface DirectorConversationProvider {
  readonly name: string
  respond(request: DirectorConversationRequest): Promise<DirectorConversationResponse>
}

export class DirectorProviderUnavailableError extends Error {
  constructor(message = "The AI Director provider is not configured") {
    super(message)
    this.name = "DirectorProviderUnavailableError"
  }
}

export function buildDirectorInstructions(project: ProjectContext, globalInstructions = defaultDirectorGlobalInstructions, brandContext = ""): string {
  const brief = project.creativeBrief
  return [
    "You are the Lead AI Film & Commercial Director Agent inside AI Director Hub.",
    "DIRECTORIAL BEHAVIOR RULES:",
    "1. NEVER give generic AI greetings or disclaimers (do NOT say 'I am an AI assistant' or 'As an AI model'). Jump directly into expert directorial analysis and action.",
    "2. DO NOT ask the user what happened or ask step-by-step redundant questions about what is already done in the project. Read the live project state provided.",
    "3. Be proactive ONLY when the user has not named a specific task: state clearly where the production currently stands, what needs to happen next, and execute or recommend the exact next directorial step. This does not apply when the user asked for something particular — see rule 9.",
    // Rule 4 used to read "do not trigger costly generation without structured
    // proposal and explicit user approval", which describes a world where the
    // model could spend credits directly. It cannot: calling submit_generation
    // creates the approval card and charges nothing, and the card is the only
    // way the user can approve anything. Read literally the old rule asked the
    // model to wait for an approval that could not exist until it acted, so it
    // stalled and told the user to press a button that was never rendered —
    // breaking rule 6 to obey rule 4. Both models did this, every time.
    "4. Calling submit_generation IS the structured proposal. It spends no credits: it renders an approval card the user can accept or refuse, and no generation can happen until you call it. So when the user asks for a shot, image, or clip, call submit_generation in that same turn. Never wait for approval before calling it, never describe a proposal you have not created, and never tell the user a card is waiting unless the tool call you just made produced one.",
    "5. Preserve approved assets and decisions unless the user explicitly requests a change.",
    "6. Never answer with instructions for the user to click through the workspace ('open the Storyboard tab', 'press Generate'). You hold the tools; do the work yourself and report what you did.",
    "7. Close every reply with a short plain-language answer: what you just did, and what the single next step is. The workspace shows that next step as one button, so your last sentence should make pressing it the obvious move. A rejected request is answered with why, not with a next step that ignores it.",
    "8. When the user has not named a specific task — 'continue', 'what's next', pressing the suggested next-step button — do the stage the production is on, then hand back. One stage per turn, and never run ahead into a stage they have not approved.",
    "9. When the user's message names a specific task — fix something, change a prompt, edit an asset, answer a question, redo a shot, adjust a setting — that request is this turn's entire job. Do it, completely, before considering anything else. Do not let it collapse into 'generate the next shot' or any other pipeline stage: the pipeline's next action is not what was asked, and running it instead of the fix is answering a different question than the one asked. Only once the requested task is done does the reply close with the pipeline's next step as the suggested follow-up — offered, never substituted for the work just requested.",
    revisionRoutingInstructions(),
    "Global admin instructions:",
    globalInstructions,
    `Project: ${project.name}`,
    `Production mode: ${project.productionMode}`,
    `Project type: ${project.projectType}`,
    `Objective: ${brief.objective || "Not confirmed"}`,
    `Audience: ${brief.audience || "Not confirmed"}`,
    `Platform: ${brief.platform || "Not confirmed"}`,
    `Aspect ratio: ${brief.aspectRatio || project.defaultAspect}`,
    `Style: ${brief.style || project.defaultStyle}`,
    `Language: ${brief.language || "Not confirmed"}`,
    // A project produced for a brand inherits that brand's voice, rules, and
    // asset library. Without it the Director would invent a look per project
    // and the same product would render differently in every episode.
    ...(brandContext.trim() ? ["", "This production is made for the following brand. Its rules are binding, and its asset library is the look to keep.", brandContext.trim()] : []),
  ].join("\n")
}

/**
 * What the compaction note says in place of the turns it stands for.
 *
 * Deliberately model-free. Summarising the dropped range with another model
 * call would cost a round trip on every long session and could itself be wrong;
 * stating plainly that the range existed, how big it was, and that it can still
 * be read is accurate for nothing and cheap for everything.
 */
export function compactionNotice(droppedMessages: number): string {
  return `[${droppedMessages} earlier message${droppedMessages === 1 ? "" : "s"} from this conversation are not shown here, to keep the context affordable. The user's opening request is kept above. If you need something that was agreed in between, ask the user rather than assuming it.]`
}

/**
 * The slice of a conversation that is actually sent to the model.
 *
 * This used to be `slice(-30)` and nothing else, which meant that at message
 * thirty-one the opening request — "a 60-second vertical ad, moody, for X" —
 * stopped being sent, with no summary in its place and no sign to the model
 * that anything had gone. It would then confidently carry on against a brief it
 * could no longer see.
 *
 * So the opening is kept, a notice stands in for the range that was dropped,
 * and the rest of the budget goes to the most recent turns. Nothing is deleted
 * anywhere: this only decides what travels, and the full transcript stays in
 * creator_chat_messages for the user to scroll and for any later replay.
 */
export function selectConversationWindow(
  messages: DirectorMessage[],
  maximumMessages = 30,
  options: {
    /**
     * Messages that exist in this session before the ones handed in, and were
     * never fetched. The caller reads a bounded page of recent history, so
     * without this the notice would only count what the page itself dropped and
     * would under-report a long session by hundreds of turns.
     */
    droppedBefore?: number
  } = {},
): DirectorMessage[] {
  const parsed = z.array(directorMessageSchema).parse(messages)
  const budget = Math.max(1, maximumMessages)
  const droppedBefore = Math.max(0, options.droppedBefore ?? 0)
  if (parsed.length <= budget && !droppedBefore) return parsed

  // Under three there is no room for an opening, a notice and a tail, so the
  // plain tail is the honest answer — a notice with nothing kept above it
  // would describe a brief that is not there.
  if (budget < 3) return parsed.slice(-budget)

  const opening = parsed[0]
  // Never back past index 1. A page short enough for the tail to reach the
  // start would otherwise send the opening twice — once as the kept brief and
  // again as the first message of the tail.
  const tail = parsed.slice(Math.max(1, parsed.length - (budget - 2)))
  const dropped = parsed.length - tail.length - 1 + droppedBefore
  if (dropped <= 0) return parsed.slice(-budget)

  return [opening, { role: "system", content: compactionNotice(dropped) }, ...tail]
}

/**
 * How many of the most recent assistant turns get their tool results replayed.
 *
 * Every one of these costs context on every step of the next turn, so it is a
 * small number deliberately: enough that "now regenerate shot 4" does not have
 * to re-list the storyboard, not so many that the saving is spent carrying
 * results nobody is going to refer to again.
 */
const REPLAY_TURNS = 3

type StoredMessage = { role: string; content: string | null; tool_calls?: unknown }

/**
 * Turns stored history into the messages the model sees, carrying recent tool
 * results back with it.
 *
 * The tool_calls column has always been written and never read. Without it each
 * new turn began blind: the Director had its own prose from last turn saying it
 * had read the storyboard, but not what the storyboard said — so it read the
 * script, the shots and the entities again, from scratch, every single message,
 * and the user paid for all of it every time.
 *
 * Replayed as text rather than as provider tool-call items on purpose. The
 * stored calls have no call ids that this turn's provider would recognise, and
 * a function_call without a matching output is rejected outright by both
 * providers. As a note attached to the assistant turn that made the calls, it
 * is just context, and it survives a model switch mid-session.
 */
export function replayToolResults(history: StoredMessage[], replayTurns = REPLAY_TURNS): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const assistantIndexes = history
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item.role === "assistant" && Array.isArray(entry.item.tool_calls) && entry.item.tool_calls.length)
    .slice(-replayTurns)
    .map((entry) => entry.index)
  const replayAt = new Set(assistantIndexes)

  return history.flatMap((item, index) => {
    const role = item.role === "assistant" ? "assistant" as const : item.role === "system" ? "system" as const : "user" as const
    const base = { role, content: String(item.content ?? "") }
    if (!replayAt.has(index)) return [base]

    const calls = (item.tool_calls as Array<{ tool?: unknown; result?: unknown }>).slice(0, 8)
    const summary = calls
      .map((call) => {
        const tool = typeof call.tool === "string" ? call.tool : "tool"
        // Pruned to the same budget the live loop uses, so replaying a turn
        // costs no more than the turn itself did.
        return `${tool} → ${serializeToolOutput(call.result, { tool }).output}`
      })
      .join("\n")
    if (!summary) return [base]
    return [base, { role: "system" as const, content: `[What your tools returned on that turn, so you do not need to read it again:\n${summary}\n]` }]
  })
}
