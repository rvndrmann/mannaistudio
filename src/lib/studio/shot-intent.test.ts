import { describe, expect, it } from "vitest"
import { actionMatchesRequestedShots, parseRequestedShotNumbers } from "./shot-intent"

describe("parseRequestedShotNumbers", () => {
  it("reads a single named shot", () => {
    expect(parseRequestedShotNumbers("generate shot 2 video")).toEqual([2])
    expect(parseRequestedShotNumbers("make a video for shot #7")).toEqual([7])
  })

  it("reads a list of shots", () => {
    expect(parseRequestedShotNumbers("generate video for shots 1, 3 and 5")).toEqual([1, 3, 5])
    expect(parseRequestedShotNumbers("render shots 2 & 4")).toEqual([2, 4])
  })

  it("expands a range", () => {
    expect(parseRequestedShotNumbers("generate shots 2-4 video")).toEqual([2, 3, 4])
    expect(parseRequestedShotNumbers("animate shots 1 to 3")).toEqual([1, 2, 3])
  })

  it("does not read a range twice as a bare shot", () => {
    expect(parseRequestedShotNumbers("shots 2-3")).toEqual([2, 3])
  })

  it("ignores an implausibly wide range rather than proposing a hundred jobs", () => {
    expect(parseRequestedShotNumbers("generate shots 2-900")).toEqual([])
  })

  it("treats the first shot as shot 1", () => {
    expect(parseRequestedShotNumbers("generate the first shot video")).toEqual([1])
  })

  it("returns nothing when no shot is named", () => {
    expect(parseRequestedShotNumbers("generate video")).toEqual([])
    expect(parseRequestedShotNumbers("make 3 videos")).toEqual([])
    expect(parseRequestedShotNumbers("generate video for every shot")).toEqual([])
  })

  it("deduplicates and sorts", () => {
    expect(parseRequestedShotNumbers("shot 3 and shot 1 and shot 3")).toEqual([1, 3])
  })

  it("ignores shot zero", () => {
    expect(parseRequestedShotNumbers("generate shot 0 video")).toEqual([])
  })
})

describe("actionMatchesRequestedShots", () => {
  it("blocks an unrelated pipeline action from a targeted turn", () => {
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [1])).toBe(false)
    expect(actionMatchesRequestedShots("Generate the image for shot 1", [1])).toBe(true)
  })

  it("keeps non-shot pipeline actions and untargeted turns", () => {
    expect(actionMatchesRequestedShots("Review the cut for continuity", [1])).toBe(true)
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [])).toBe(true)
  })
})
