import { describe, expect, it } from "vitest"
import { buildDirectorInstructions, selectConversationWindow } from "./conversation"
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
    expect(selectConversationWindow(messages, 5).map((message) => message.content)).toEqual(["35", "36", "37", "38", "39"])
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
