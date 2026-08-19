import { describe, expect, it } from "vitest"
import { parseDirectorTimeline } from "./timeline"

describe("Director timeline", () => {
  it("accepts typed execution and next-action blocks", () => {
    const blocks = parseDirectorTimeline([
      { type: "tool_execution", tool: "read_episode_script", label: "Read saved script", status: "completed" },
      { type: "suggested_actions", actions: [{ id: "extract", label: "Extract missing entities", intent: "Extract missing entities from the saved script", payload: {}, risk: "write", recommended: true }] },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe("tool_execution")
  })

  it("keeps contextual workflow actions longer than a short button label", () => {
    const intent = `Generate reference art only for these assets: ${"named production asset, ".repeat(20)}`
    const blocks = parseDirectorTimeline([
      { type: "suggested_actions", actions: [{ id: "reference-art", label: "Generate reference art", intent, payload: {}, risk: "costly", recommended: true }] },
    ])

    expect(intent.length).toBeGreaterThan(200)
    expect(blocks).toHaveLength(1)
  })

  it("drops malformed persisted data instead of breaking chat rendering", () => {
    expect(parseDirectorTimeline([{ type: "tool_execution", status: "unknown" }])).toEqual([])
    expect(parseDirectorTimeline(null)).toEqual([])
  })

  it("drops only the unreadable block, keeping the rest of the reply", () => {
    // One block over its cap used to take the whole timeline with it, so the
    // reply lost its production track and its next-step button — on exactly the
    // long runs where the button matters most.
    const blocks = parseDirectorTimeline([
      { type: "tool_execution", tool: "create_storyboard_batch", label: "Create storyboard", status: "completed" },
      { type: "tool_execution", tool: "update_shot", label: "x".repeat(400), status: "completed" },
      { type: "suggested_actions", actions: [{ id: "keyframes", label: "Generate the shot 1 keyframe", intent: "Generate the keyframe for shot 1", payload: {}, risk: "costly", recommended: true }] },
    ])

    expect(blocks).toHaveLength(2)
    expect(blocks.map((block) => block.type)).toEqual(["tool_execution", "suggested_actions"])
  })

  it("keeps known blocks when a newer deploy wrote a type this page cannot read", () => {
    const blocks = parseDirectorTimeline([
      { type: "agent_handoff", from: "Script Agent", to: "Storyboard Agent" },
      { type: "suggested_actions", actions: [{ id: "next", label: "Continue", intent: "Continue the production", payload: {}, risk: "read", recommended: true }] },
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("suggested_actions")
  })
})
