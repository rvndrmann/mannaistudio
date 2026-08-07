import { z } from "zod"
import type { ProjectContext } from "./domain"

export const voiceSessionRequestSchema = z.object({
  projectId: z.string().uuid(),
  chatSessionId: z.string().uuid().optional(),
  voice: z.string().trim().min(1).max(100).default("default"),
  language: z.string().trim().min(2).max(80).default("en"),
  interactionMode: z.enum(["hands_free", "push_to_talk"]).default("hands_free"),
}).strict()

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
