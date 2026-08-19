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
  it("keeps the step for the shot the turn was about", () => {
    expect(actionMatchesRequestedShots("Generate the image for shot 1", [1])).toBe(true)
    expect(actionMatchesRequestedShots("Generate the video for shot 1 from its approved keyframe", [1])).toBe(true)
  })

  // Finishing shot 1's keyframe used to end with no button at all, because the
  // pipeline had moved on to shot 2 and a step naming another shot was held.
  it("keeps the step the finished shot leads to", () => {
    expect(actionMatchesRequestedShots("Generate the storyboard keyframe image for shot 2", [1])).toBe(true)
    expect(actionMatchesRequestedShots("Generate the image for shot 9", [4, 8])).toBe(true)
  })

  it("still holds a step that points back at an earlier shot", () => {
    expect(actionMatchesRequestedShots("Generate the image for shot 3", [8])).toBe(false)
    expect(actionMatchesRequestedShots("Generate the image for shot 3", [4, 8])).toBe(false)
  })

  // Asking to redo shot 7 offered "generate the keyframe for shot 11", which was
  // an unfinished job from earlier in the session rather than anything to do
  // with the request. The pipeline reports the first shot still needing work
  // anywhere in the episode, so "any later shot" let that unrelated backlog
  // through, and taking the offer spent credits on the wrong shot.
  it("holds a step that skips ahead past the next shot", () => {
    expect(actionMatchesRequestedShots("Generate the storyboard keyframe image for shot 11", [7])).toBe(false)
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [1])).toBe(false)
  })

  it("keeps non-shot pipeline actions and untargeted turns", () => {
    expect(actionMatchesRequestedShots("Review the cut for continuity", [1])).toBe(true)
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [])).toBe(true)
  })
})
