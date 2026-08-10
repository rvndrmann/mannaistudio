import { describe, expect, it } from "vitest"
import { parseVoiceToolCall, voiceSessionRequestSchema, voiceToolInstructions, type VoiceAgentEvent } from "./voice"

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

  it("reads a completed tool call from the output_item event", () => {
    const call = parseVoiceToolCall({
      type: "response.output_item.done",
      item: { type: "function_call", call_id: "call_1", name: "list_storyboard_shots", arguments: '{"episodeId":"e1"}' },
    })
    expect(call).toEqual({ callId: "call_1", name: "list_storyboard_shots", arguments: { episodeId: "e1" } })
  })

  it("also reads the function_call_arguments event shape", () => {
    const call = parseVoiceToolCall({
      type: "response.function_call_arguments.done",
      call_id: "call_2",
      name: "inspect_current_project",
      arguments: "{}",
    })
    expect(call).toEqual({ callId: "call_2", name: "inspect_current_project", arguments: {} })
  })

  it("ignores unrelated events and malformed calls", () => {
    expect(parseVoiceToolCall({ type: "response.audio.delta" })).toBeNull()
    expect(parseVoiceToolCall({ type: "response.output_item.done", item: { type: "message" } })).toBeNull()
    expect(parseVoiceToolCall({ type: "response.output_item.done", item: { type: "function_call", name: "x" } })).toBeNull()
    expect(parseVoiceToolCall(null)).toBeNull()
  })

  it("falls back to empty arguments when the model streams invalid JSON", () => {
    const call = parseVoiceToolCall({
      type: "response.output_item.done",
      item: { type: "function_call", call_id: "call_3", name: "inspect_current_project", arguments: "{not json" },
    })
    expect(call).toEqual({ callId: "call_3", name: "inspect_current_project", arguments: {} })
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
