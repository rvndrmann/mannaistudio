import { describe, expect, it } from "vitest"
import { emptySnapshot, type ProductionSnapshot } from "./pipeline"
import { buildProductionProgress, levelForXp, stagesReached, trackStageFor } from "./production-progress"

const withScript: ProductionSnapshot = { ...emptySnapshot, hasScript: true }

describe("buildProductionProgress", () => {
  it("starts at the script with nothing done", () => {
    const progress = buildProductionProgress(emptySnapshot)
    expect(progress.currentStage).toBe("script")
    expect(progress.completedStages).toBe(0)
    expect(progress.percent).toBe(0)
    expect(progress.stages[0].status).toBe("current")
  })

  it("marks the stages behind the current one as done", () => {
    const progress = buildProductionProgress({ ...withScript, promptSheetCount: 6, promptSheetEntityNames: ["Maya"] })
    expect(progress.currentStage).toBe("entities")
    expect(progress.stages.filter((stage) => stage.status === "done").map((stage) => stage.key)).toEqual(["script", "prompt_sheet"])
    expect(progress.percent).toBeGreaterThan(0)
  })

  it("folds the sub-stages into the step a person recognises", () => {
    // Eight raw stages read as a chore; the user sees six.
    expect(trackStageFor("entity_images")).toBe("entities")
    expect(trackStageFor("keyframes")).toBe("storyboard")
    expect(buildProductionProgress(emptySnapshot).totalStages).toBe(6)
  })

  it("pays for every stage passed, not just the one showing", () => {
    const reached = stagesReached({ ...withScript, promptSheetCount: 4, promptSheetEntityNames: ["Maya"] })
    expect(reached.map((stage) => stage.key)).toEqual(["script", "prompt_sheet"])
    expect(reached.every((stage) => stage.xp > 0)).toBe(true)
  })

  it("awards nothing before the first stage is behind you", () => {
    expect(stagesReached(emptySnapshot)).toEqual([])
    expect(buildProductionProgress(emptySnapshot).earnedXp).toBe(0)
  })
})

describe("levelForXp", () => {
  it("starts at level one and rises on a widening curve", () => {
    expect(levelForXp(0).level).toBe(1)
    expect(levelForXp(499).level).toBe(1)
    expect(levelForXp(500).level).toBe(2)
    // The second level costs more than the first, so a hundredth production
    // does not hand out the same level as the first.
    const second = levelForXp(500)
    expect(second.needed).toBeGreaterThan(500)
  })

  it("reports how far into the level the user is", () => {
    const at = levelForXp(600)
    expect(at.level).toBe(2)
    expect(at.into).toBe(100)
  })

  it("treats a broken balance as zero rather than a negative level", () => {
    expect(levelForXp(-100).level).toBe(1)
  })
})
