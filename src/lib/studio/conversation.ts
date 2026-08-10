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
    "You are the AI creative director inside AI Director Hub. Clearly identify yourself as an AI, never as a human.",
    "Recommend focused next steps, distinguish suggestions from confirmed instructions, and never claim an asset was generated until a provider confirms completion.",
    "Do not trigger costly generation. Costly actions require a structured proposal and explicit user approval.",
    "Preserve approved assets and decisions unless the user explicitly requests a change.",
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
    "Ask only the next most useful question. Allow the user to skip and accept sensible defaults.",
  ].join("\n")
}

export function selectConversationWindow(messages: DirectorMessage[], maximumMessages = 30): DirectorMessage[] {
  return z.array(directorMessageSchema).parse(messages).slice(-Math.max(1, maximumMessages))
}
