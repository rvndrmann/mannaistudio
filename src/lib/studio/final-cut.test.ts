import { describe, expect, it } from "vitest"
import { finalCutStoragePath, parseFinalCutSave, readFinalCut } from "./final-cut"

const ids = { userId: "user-1", projectId: "project-1", episodeId: "episode-1" }

describe("finalCutStoragePath", () => {
  it("files the cut under the caller's own episode folder", () => {
    expect(finalCutStoragePath({ ...ids, filename: "My Edit (v2).mp4", now: 42 })).toBe("user-1/project-1/final-cuts/episode-1/42-My-Edit-v2.mp4")
  })

  it("keeps a webm a webm and defaults anything else to mp4", () => {
    expect(finalCutStoragePath({ ...ids, filename: "cut.webm", now: 1 })).toMatch(/1-cut\.webm$/)
    expect(finalCutStoragePath({ ...ids, filename: "", now: 1 })).toMatch(/1-cut\.mp4$/)
  })
})

describe("parseFinalCutSave", () => {
  const now = new Date("2026-10-22T10:00:00Z")

  it("records a cut uploaded where the editor puts it", () => {
    const path = finalCutStoragePath({ ...ids, filename: "Episode.mp4", now: 5 })
    expect(parseFinalCutSave({ path, filename: "Episode.mp4", durationSeconds: 31.4567, sizeBytes: 1024.4 }, { ...ids, now })).toEqual({
      path,
      filename: "Episode.mp4",
      duration_seconds: 31.46,
      size_bytes: 1024,
      saved_at: "2026-10-22T10:00:00.000Z",
      saved_by: "user-1",
    })
  })

  it.each([
    ["another user's folder", "user-2/project-1/final-cuts/episode-1/1-cut.mp4"],
    ["another episode", "user-1/project-1/final-cuts/episode-2/1-cut.mp4"],
    ["a nested path", "user-1/project-1/final-cuts/episode-1/a/1-cut.mp4"],
    ["a traversal", "user-1/project-1/final-cuts/episode-1/..mp4"],
    ["a non-video", "user-1/project-1/final-cuts/episode-1/1-cut.png"],
    ["the folder itself", "user-1/project-1/final-cuts/episode-1/"],
  ])("refuses %s", (_label, path) => {
    expect(() => parseFinalCutSave({ path }, { ...ids, now })).toThrow()
  })

  it("drops a duration or size it cannot read rather than storing garbage", () => {
    const path = finalCutStoragePath({ ...ids, filename: "x.mp4", now: 5 })
    const cut = parseFinalCutSave({ path, durationSeconds: "abc", sizeBytes: -3 }, { ...ids, now })
    expect(cut.duration_seconds).toBeNull()
    expect(cut.size_bytes).toBeNull()
    expect(cut.filename).toBe("5-x.mp4")
  })
})

describe("readFinalCut", () => {
  it("reads nothing from an episode without a cut", () => {
    expect(readFinalCut(null)).toBeNull()
    expect(readFinalCut({})).toBeNull()
  })
})
