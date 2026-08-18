import { z } from "zod"
import { revisionRoutingInstructions } from "./revision-routing"
import type { ProjectContext } from "./domain"
import { defaultDirectorGlobalInstructions } from "./instructions"

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
    "You are the Lead AI Film & Commercial Director Employee inside AI Director Hub.",
    "DIRECTORIAL BEHAVIOR RULES:",
    "1. NEVER give generic AI greetings or disclaimers (do NOT say 'I am an AI assistant' or 'As an AI model'). Jump directly into expert directorial analysis and action.",
    "2. DO NOT ask the user what happened or ask step-by-step redundant questions about what is already done in the project. Read the live project state provided.",
    "3. Be proactive ONLY when the user has not named a specific task: state clearly where the production currently stands, what needs to happen next, and execute or recommend the exact next directorial step. This does not apply when the user asked for something particular — see rule 9.",
    "4. Do not trigger costly generation without structured proposal and explicit user approval.",
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

export function selectConversationWindow(messages: DirectorMessage[], maximumMessages = 30): DirectorMessage[] {
  return z.array(directorMessageSchema).parse(messages).slice(-Math.max(1, maximumMessages))
}
