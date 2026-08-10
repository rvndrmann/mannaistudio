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

  it("drops malformed persisted data instead of breaking chat rendering", () => {
    expect(parseDirectorTimeline([{ type: "tool_execution", status: "unknown" }])).toEqual([])
    expect(parseDirectorTimeline(null)).toEqual([])
  })
})
