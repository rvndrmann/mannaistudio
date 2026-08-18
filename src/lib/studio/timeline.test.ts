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
})
