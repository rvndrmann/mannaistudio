import { z } from "zod"
import type { ProjectContext } from "./domain"

export const voiceSessionRequestSchema = z.object({
  projectId: z.string().uuid(),
  chatSessionId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
  voice: z.string().trim().min(1).max(100).default("default"),
  language: z.string().trim().min(2).max(80).default("en"),
  interactionMode: z.enum(["hands_free", "push_to_talk"]).default("hands_free"),
}).strict()

export function voiceToolInstructions(input: { projectId: string; episodeId?: string }) {
  return [
    "You are the AI Voice Director for this project and you can operate the workspace with the same tools as the text chat Director.",
    `Current project ID: ${input.projectId}`,
    `Current episode ID: ${input.episodeId || "No episode selected"}`,
    "Use tools to read the script, entities, storyboard, and jobs before answering questions about them instead of guessing.",
    "Executable workspace changes must be made by calling the matching tool; never claim a change was applied without a tool call.",
    "Tool calls that require approval create an approval card in the Studio chat panel and are not applied until the user approves the card there. After proposing one, tell the user to review and approve the card in the chat panel.",
    "Video generation always requires an approval card unless full-auto mode is enabled.",
    "Keep spoken confirmations short: state what you did or proposed and what the user should do next.",
  ].join("\n")
}

export type VoiceConnectionState = "idle" | "requesting_microphone" | "connecting" | "connected" | "reconnecting" | "ended" | "error"
export type VoiceSessionRequest = z.infer<typeof voiceSessionRequestSchema>

export type EphemeralVoiceSession = {
  provider: string
  sessionId: string
  ephemeralCredential: string
  expiresAt: string
  realtimeUrl?: string
  model?: string
}

export interface VoiceSessionProvider {
  readonly name: string
  createEphemeralSession(request: VoiceSessionRequest, project: ProjectContext): Promise<EphemeralVoiceSession>
  endSession(providerSessionId: string): Promise<void>
}

export type VoiceAgentEvent =
  | { type: "connection"; state: VoiceConnectionState }
  | { type: "user_transcript"; text: string; final: boolean }
  | { type: "agent_transcript"; text: string; final: boolean }
  | { type: "interruption" }
  | { type: "usage"; inputAudioSeconds: number; outputAudioSeconds: number }
  | { type: "error"; code: string; message: string; recoverable: boolean }
