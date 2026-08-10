import { describe, expect, it } from "vitest"
import { routeGeneration } from "./model-routing"
import { requiresRevisionApproval } from "./revisions"
import { submitGenerationTool } from "./tool-registry"

const shotId = "00000000-0000-4000-8000-000000000010"

describe("generation routing and cost", () => {
  it("returns a visible per-shot and total credit estimate", () => {
    const result = routeGeneration({ type: "video", shotIds: [shotId, "00000000-0000-4000-8000-000000000011"], durationSeconds: 6 })
    expect(result.estimatedCredits).toBe(result.creditsPerShot * 2)
    expect(result.selected.provider).toBeDefined()
  })

  it("routes dialogue only to a dialogue-capable model", () => {
    const result = routeGeneration({ type: "video", source: "image", shotIds: [shotId], dialogueRequired: true })
    expect(result.selected.dialogue).toBe(true)
  })

  it("preserves mentioned production entities in generation routing", () => {
    const entityId = "00000000-0000-4000-8000-000000000012"
    const result = routeGeneration({ type: "video", shotIds: [shotId], mentionedEntityIds: [entityId] })
    expect(result.request.mentionedEntityIds).toEqual([entityId])
  })

  it("requires approval for every generation submission", () => {
    expect(submitGenerationTool.risk).toBe("costly")
    expect(submitGenerationTool.requiresApproval).toBe(true)
  })
})

describe("revision impact", () => {
  it("requires approval when regeneration spends credits", () => {
    const result = requiresRevisionApproval({ instruction: "Replace only Shot 3", change: { targetType: "shot", targetIds: [shotId], operation: "regenerate" }, lockedAssets: [], estimatedCredits: 12 })
    expect(result.required).toBe(true)
    expect(result.revision.change.targetIds).toEqual([shotId])
  })

  it("preserves explicit locked assets", () => {
    const result = requiresRevisionApproval({ instruction: "Colder lighting", change: { targetType: "shot", targetIds: [shotId], operation: "update", fields: { lighting: "cold" } }, lockedAssets: [shotId], estimatedCredits: 0 })
    expect(result.revision.lockedAssets).toEqual([shotId])
  })
})
