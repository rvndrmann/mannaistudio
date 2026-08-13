import { describe, expect, it } from "vitest"
import { buildGenerationTargetSnapshot, verifyGenerationTarget } from "./generation-target"

describe("generation target snapshots", () => {
  const target = buildGenerationTargetSnapshot({ projectId: "project", episodeId: "episode-2", shotId: "shot-1", shotNumber: 1, type: "image", prompt: "fixed prompt", entityReferenceIds: ["lena", "ethan", "ethan"], createdAt: "2026-08-13T00:00:00.000Z" })

  it("freezes the exact prompt and deduplicated cast", () => {
    expect(target.shotNumber).toBe(1)
    expect(target.entityReferenceIds).toEqual(["ethan", "lena"])
    expect(target.promptHash).toHaveLength(64)
  })

  it("accepts only an output attached to the approved target", () => {
    expect(verifyGenerationTarget({ target, actual: { shotId: "shot-1", episodeId: "episode-2", prompt: "fixed prompt", entityReferenceIds: ["ethan", "lena", "bedroom"], resultPath: "new.png" }, expectedResultPath: "new.png" }).ok).toBe(true)
    expect(verifyGenerationTarget({ target, actual: { shotId: "shot-4", episodeId: "episode-2", prompt: "fixed prompt", entityReferenceIds: ["ethan", "lena"], resultPath: "new.png" }, expectedResultPath: "new.png" }).checks.shot).toBe(false)
  })

  it("detects prompt, reference, and attachment drift", () => {
    const result = verifyGenerationTarget({ target, actual: { shotId: "shot-1", episodeId: "episode-2", prompt: "different", entityReferenceIds: ["ethan"], resultPath: "old.png" }, expectedResultPath: "new.png" })
    expect(result.ok).toBe(false)
    expect(result.checks).toMatchObject({ prompt: false, references: false, attachment: false })
  })
})
