import { describe, expect, it } from "vitest"
import { actionMatchesRequestedShots, buildVideoContinuationPrompt, parseRequestedShotNumbers, parseShotImageBatchIntent, parseTargetShotNumbers, parseVideoShotReferenceIntent , wantsRedo } from "./shot-intent"

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

describe("parseVideoShotReferenceIntent", () => {
  it("separates a target shot from a referenced shot video", () => {
    expect(parseVideoShotReferenceIntent("now create shot 2 video using shot 1 video as refrence")).toEqual({
      targetShotNumbers: [2],
      referenceShotNumbers: [1],
    })
    expect(parseTargetShotNumbers("now create shot 2 video using shot 1 video as refrence")).toEqual([2])
  })

  it("works in either direction and with video-first wording", () => {
    expect(parseVideoShotReferenceIntent("create shot 1 using the video from shot 2")).toEqual({
      targetShotNumbers: [1],
      referenceShotNumbers: [2],
    })
  })

  it("infers the following shot when the user says next scene", () => {
    expect(parseVideoShotReferenceIntent("extend from shot 4 video into the next scene")).toEqual({
      targetShotNumbers: [5],
      referenceShotNumbers: [4],
    })
  })

  it("does not change an ordinary video batch", () => {
    expect(parseVideoShotReferenceIntent("generate videos for shots 1, 2")).toEqual({
      targetShotNumbers: [1, 2],
      referenceShotNumbers: [],
    })
  })
})

describe("buildVideoContinuationPrompt", () => {
  it("adds the continuation, target composition, and realistic style instructions", () => {
    const prompt = buildVideoContinuationPrompt({ targetShotNumber: 2, basePrompt: "Sophie calls.", style: "Realistic - Photorealistic" })
    expect(prompt).toContain("Extend from video @previous shot video")
    expect(prompt).toContain("@storyboard shot 2 image")
    expect(prompt).toContain("Photorealistic, hyper realistic.")
    expect(prompt).toContain("Sophie calls.")
  })

  it("names a non-previous reference explicitly for the reverse workflow", () => {
    const prompt = buildVideoContinuationPrompt({ targetShotNumber: 1, referenceShotNumber: 2, basePrompt: "Wake up.", style: "Realistic" })
    expect(prompt).toContain("video @storyboard shot 2 video")
    expect(prompt).toContain("@storyboard shot 1 image")
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
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [1])).toBe(true)
  })

  it("still holds a step that points back at an earlier shot", () => {
    expect(actionMatchesRequestedShots("Generate the image for shot 3", [8])).toBe(false)
    expect(actionMatchesRequestedShots("Generate the image for shot 3", [4, 8])).toBe(false)
  })

  it("keeps non-shot pipeline actions and untargeted turns", () => {
    expect(actionMatchesRequestedShots("Review the cut for continuity", [1])).toBe(true)
    expect(actionMatchesRequestedShots("Generate the image for shot 4", [])).toBe(true)
  })
})

describe("redo requests", () => {
  // "recreate the shot 6 video" matched neither media path — \bcreate\b does not
  // fire inside "recreate" — so it reached the agent, which replied with an
  // inspection report on a different shot.
  it("recognises the ways a redo is actually written", () => {
    for (const message of [
      "recreate the shot 6 video",
      "re-create shot 6 video",
      "regenerate shot 1",
      "redo the keyframe for shot 4",
      "remake shot 2 video",
      "render shot 3 again",
    ]) {
      expect(wantsRedo(message)).toBe(true)
    }
  })

  it("leaves an ordinary request alone", () => {
    expect(wantsRedo("generate the video for shot 7")).toBe(false)
    expect(wantsRedo("what is left to do?")).toBe(false)
  })

  it("keeps the shot number a redo names", () => {
    expect(parseTargetShotNumbers("recreate the shot 6 video")).toEqual([6])
  })
})

describe("parseShotImageBatchIntent", () => {
  it("reads a request covering the whole storyboard", () => {
    for (const message of [
      "generate all shot image",
      "generate all the shot images",
      "create images for all shots",
      "generate every shot image",
      "generate the remaining shot images",
      "generate images for the rest of the shots",
    ]) {
      expect(parseShotImageBatchIntent(message), message).toMatchObject({ all: true })
    }
  })

  it("reads a helping size, and does not mistake it for a shot number", () => {
    expect(parseShotImageBatchIntent("generate the first 3 shot images")).toMatchObject({ chunk: 3, numbers: [] })
    expect(parseShotImageBatchIntent("generate 3 more")).toMatchObject({ chunk: 3, numbers: [] })
    expect(parseShotImageBatchIntent("next 5 images please")).toMatchObject({ chunk: 5, numbers: [] })
  })

  it("reads an outright list of shots", () => {
    expect(parseShotImageBatchIntent("generate images for shots 8, 9, 10")).toMatchObject({ numbers: [8, 9, 10] })
  })

  it("leaves a single-shot request to the path that renders one", () => {
    expect(parseShotImageBatchIntent("generate the image for shot 1")).toBeNull()
    expect(parseShotImageBatchIntent("regenerate shot 6")).toBeNull()
  })
})
