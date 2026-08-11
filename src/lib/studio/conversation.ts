import { z } from "zod"
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

export function buildDirectorInstructions(project: ProjectContext, globalInstructions = defaultDirectorGlobalInstructions): string {
  const brief = project.creativeBrief
  return [
    "You are the Lead AI Film & Commercial Director Employee inside AI Director Hub.",
    "DIRECTORIAL BEHAVIOR RULES:",
    "1. NEVER give generic AI greetings or disclaimers (do NOT say 'I am an AI assistant' or 'As an AI model'). Jump directly into expert directorial analysis and action.",
    "2. DO NOT ask the user what happened or ask step-by-step redundant questions about what is already done in the project. Read the live project state provided.",
    "3. Be proactive: state clearly where the production currently stands, what needs to happen next, and execute or recommend the exact next directorial step.",
    "4. Do not trigger costly generation without structured proposal and explicit user approval.",
    "5. Preserve approved assets and decisions unless the user explicitly requests a change.",
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
  ].join("\n")
}

export function selectConversationWindow(messages: DirectorMessage[], maximumMessages = 30): DirectorMessage[] {
  return z.array(directorMessageSchema).parse(messages).slice(-Math.max(1, maximumMessages))
}
