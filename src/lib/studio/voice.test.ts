import { describe, expect, it } from "vitest"
import { voiceSessionRequestSchema, voiceToolInstructions, type VoiceAgentEvent } from "./voice"

describe("voice preparation", () => {
  it("validates authenticated project-scoped session input", () => {
    const request = voiceSessionRequestSchema.parse({ projectId: "00000000-0000-4000-8000-000000000020" })
    expect(request.interactionMode).toBe("hands_free")
    expect(request.language).toBe("en")
  })

  it("accepts the current episode so voice tools target the open workspace", () => {
    const request = voiceSessionRequestSchema.parse({ projectId: "00000000-0000-4000-8000-000000000020", episodeId: "00000000-0000-4000-8000-000000000021" })
    expect(request.episodeId).toBe("00000000-0000-4000-8000-000000000021")
  })

  it("instructs the voice director to use tools and the approval flow", () => {
    const instructions = voiceToolInstructions({ projectId: "project-1", episodeId: "episode-1" })
    expect(instructions).toContain("Current project ID: project-1")
    expect(instructions).toContain("Current episode ID: episode-1")
    expect(instructions).toContain("approval card")
    expect(voiceToolInstructions({ projectId: "project-1" })).toContain("No episode selected")
  })

  it("models transcripts, interruption, usage, and recoverable errors", () => {
    const events: VoiceAgentEvent[] = [
      { type: "user_transcript", text: "Make it colder", final: true },
      { type: "interruption" },
      { type: "usage", inputAudioSeconds: 2, outputAudioSeconds: 3 },
      { type: "error", code: "connection_lost", message: "Reconnect", recoverable: true },
    ]
    expect(events.map((event) => event.type)).toEqual(["user_transcript", "interruption", "usage", "error"])
  })
})
