import { describe, expect, it } from "vitest"
import { voiceSessionRequestSchema, type VoiceAgentEvent } from "./voice"

describe("voice preparation", () => {
  it("validates authenticated project-scoped session input", () => {
    const request = voiceSessionRequestSchema.parse({ projectId: "00000000-0000-4000-8000-000000000020" })
    expect(request.interactionMode).toBe("hands_free")
    expect(request.language).toBe("en")
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
