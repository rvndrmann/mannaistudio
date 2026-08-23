import { describe, expect, it } from "vitest"
import { buildDirectorInstructions, compactionNotice, replayToolResults, selectConversationWindow } from "./conversation"
import { projectContextSchema } from "./domain"

const project = projectContextSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Roommate skincare series",
  description: null,
  productionMode: "story_campaign",
  projectType: "brand_series",
  creativeBrief: { objective: "Build brand affinity", audience: "Young adults", aspectRatio: "9:16" },
  defaultStyle: "cinematic comedy",
  defaultAspect: "16:9",
  featureFlags: {},
})

describe("AI Director conversation context", () => {
  // The old assertion required the Director to announce itself as an AI, which
  // rule 1 now forbids outright: the reply opens on the work, not on a preamble.
  it("opens on directorial work and puts generation behind an approval card", () => {
    const instructions = buildDirectorInstructions(project)
    expect(instructions).toContain("NEVER give generic AI greetings")
    expect(instructions).toContain("Roommate skincare series")
    // Not "wait for approval before generating": the tool call is what creates
    // the card, so an instruction to wait first is a deadlock, and both models
    // resolved it by telling the user to press a button nothing had rendered.
    expect(instructions).toContain("Calling submit_generation IS the structured proposal")
    expect(instructions).toContain("spends no credits")
    expect(instructions).not.toContain("Do not trigger costly generation without")
  })

  it("ends a turn on one next step rather than on click-through directions", () => {
    const instructions = buildDirectorInstructions(project)
    expect(instructions).toContain("Never answer with instructions for the user to click through the workspace")
    expect(instructions).toContain("what the single next step is")
  })

  it("uses the project brief instead of repeatedly asking confirmed details", () => {
    const instructions = buildDirectorInstructions(project)
    expect(instructions).toContain("Audience: Young adults")
    expect(instructions).toContain("Aspect ratio: 9:16")
  })

  it("bounds history sent to a provider", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({ role: "user" as const, content: String(index) }))
    // The opening is kept and a notice stands in for what was dropped, so the
    // tail is two shorter than the budget rather than filling all of it.
    expect(selectConversationWindow(messages, 5).map((message) => message.content)).toEqual([
      "0",
      compactionNotice(36),
      "37",
      "38",
      "39",
    ])
  })
})

describe("buildDirectorInstructions with a brand", () => {
  it("carries the brand briefing and marks its rules as binding", () => {
    const instructions = buildDirectorInstructions(project, undefined, "BRAND RECORD\nName: Aurora Coffee\nVoice: Warm, unhurried.")
    expect(instructions).toContain("Aurora Coffee")
    expect(instructions).toContain("Its rules are binding")
  })

  it("says nothing about a brand for a project that has none", () => {
    expect(buildDirectorInstructions(project)).not.toContain("This production is made for the following brand")
    expect(buildDirectorInstructions(project, undefined, "   ")).not.toContain("This production is made for the following brand")
  })
})

describe("compaction keeps the brief and says what it dropped", () => {
  const turns = (count: number) => Array.from({ length: count }, (_, index) => ({ role: "user" as const, content: String(index) }))

  it("sends a short conversation whole", () => {
    expect(selectConversationWindow(turns(4), 30)).toHaveLength(4)
  })

  it("keeps the opening request even when it is far outside the window", () => {
    const window = selectConversationWindow(turns(200), 10)
    expect(window[0].content).toBe("0")
    expect(window).toHaveLength(10)
  })

  it("marks the gap rather than leaving it silent", () => {
    const window = selectConversationWindow(turns(200), 10)
    expect(window[1].role).toBe("system")
    expect(window[1].content).toBe(compactionNotice(191))
  })

  it("counts the pages the caller never fetched", () => {
    // The route reads a bounded page of recent history, so a 500-message
    // session hands in 40. Without droppedBefore the notice would claim 31.
    const window = selectConversationWindow(turns(40), 10, { droppedBefore: 460 })
    expect(window[1].content).toBe(compactionNotice(491))
  })

  it("still marks the gap when the page itself fits but earlier pages do not", () => {
    const window = selectConversationWindow(turns(5), 30, { droppedBefore: 100 })
    expect(window[1].content).toBe(compactionNotice(100))
    expect(window.map((message) => message.content)).toEqual(["0", compactionNotice(100), "1", "2", "3", "4"])
  })

  it("falls back to a plain tail when there is no room for a notice", () => {
    expect(selectConversationWindow(turns(10), 2).map((message) => message.content)).toEqual(["8", "9"])
  })
})

describe("recent tool results are carried into the next turn", () => {
  const assistantWith = (calls: Array<{ tool: string; result: unknown }>) => ({ role: "assistant", content: "Done.", tool_calls: calls })

  it("attaches what the tools returned to the turn that called them", () => {
    const replayed = replayToolResults([
      { role: "user", content: "List the shots." },
      assistantWith([{ tool: "list_storyboard_shots", result: { shots: [{ number: 1 }] } }]),
    ])
    expect(replayed).toHaveLength(3)
    expect(replayed[2].role).toBe("system")
    expect(replayed[2].content).toContain("list_storyboard_shots")
    expect(replayed[2].content).toContain('"number":1')
  })

  it("leaves a turn that called nothing alone", () => {
    const replayed = replayToolResults([{ role: "assistant", content: "Hello.", tool_calls: [] }])
    expect(replayed).toEqual([{ role: "assistant", content: "Hello." }])
  })

  it("carries only the most recent turns", () => {
    const history = Array.from({ length: 6 }, (_, index) => assistantWith([{ tool: `tool_${index}`, result: { index } }]))
    const replayed = replayToolResults(history, 2)
    const notes = replayed.filter((message) => message.role === "system")
    expect(notes).toHaveLength(2)
    expect(notes[0].content).toContain("tool_4")
    expect(notes[1].content).toContain("tool_5")
  })

  it("prunes a replayed result to the same budget the live loop uses", () => {
    const huge = { shots: "S".repeat(60_000) }
    const replayed = replayToolResults([assistantWith([{ tool: "list_storyboard_shots", result: huge }])])
    const note = replayed[1].content
    expect(note.length).toBeLessThan(20_000)
    expect(note).toContain("characters omitted")
  })

  it("keeps roles the model understands", () => {
    const replayed = replayToolResults([
      { role: "user", content: "Hi." },
      { role: "assistant", content: "Hello." },
      { role: "system", content: "[note]" },
      { role: "tool", content: "raw" },
    ])
    expect(replayed.map((message) => message.role)).toEqual(["user", "assistant", "system", "user"])
  })
})
