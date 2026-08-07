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
  it("identifies the director as AI and requires approval before generation", () => {
    const instructions = buildDirectorInstructions(project)
    expect(instructions).toContain("identify yourself as an AI")
    expect(instructions).toContain("explicit user approval")
    expect(instructions).toContain("Roommate skincare series")
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
