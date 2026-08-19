import { describe, expect, it } from "vitest"
import { withCandidateNumbers } from "./generation-candidates"

const shotNumbers = new Map([["shot-a", 7], ["shot-b", 2]])

// The tool returns jobs newest-first, so the fixtures are written that way.
const job = (id: string, shot: string, result: string | null, type = "image") =>
  ({ id, shot_id: shot, type, result_url: result })

describe("picking between the images a shot already has", () => {
  it("numbers a shot's results oldest first, so candidate 1 is the first one made", () => {
    const numbered = withCandidateNumbers(
      [job("c", "shot-a", "third.png"), job("b", "shot-a", "second.png"), job("a", "shot-a", "first.png")],
      shotNumbers,
    )
    expect(numbered.map((entry) => [entry.id, entry.candidate])).toEqual([["c", 3], ["b", 2], ["a", 1]])
  })

  it("keeps the caller's newest-first order", () => {
    const numbered = withCandidateNumbers([job("c", "shot-a", "3.png"), job("a", "shot-a", "1.png")], shotNumbers)
    expect(numbered.map((entry) => entry.id)).toEqual(["c", "a"])
  })

  it("counts each shot separately", () => {
    const numbered = withCandidateNumbers(
      [job("b2", "shot-b", "b2.png"), job("a2", "shot-a", "a2.png"), job("b1", "shot-b", "b1.png"), job("a1", "shot-a", "a1.png")],
      shotNumbers,
    )
    const byId = Object.fromEntries(numbered.map((entry) => [entry.id, entry.candidate]))
    expect(byId).toEqual({ a1: 1, a2: 2, b1: 1, b2: 2 })
  })

  it("counts images and videos separately, because they are picked separately", () => {
    const numbered = withCandidateNumbers(
      [job("v1", "shot-a", "clip.mp4", "video"), job("i2", "shot-a", "2.png"), job("i1", "shot-a", "1.png")],
      shotNumbers,
    )
    const byId = Object.fromEntries(numbered.map((entry) => [entry.id, entry.candidate]))
    expect(byId).toEqual({ i1: 1, i2: 2, v1: 1 })
  })

  it("does not number a job with no result, and does not let it shift the others", () => {
    const numbered = withCandidateNumbers(
      [job("c", "shot-a", "second.png"), job("b", "shot-a", null), job("a", "shot-a", "first.png")],
      shotNumbers,
    )
    const byId = Object.fromEntries(numbered.map((entry) => [entry.id, entry.candidate]))
    expect(byId).toEqual({ a: 1, b: null, c: 2 })
  })

  it("carries the storyboard number so the shot can be named back", () => {
    const numbered = withCandidateNumbers([job("a", "shot-a", "1.png"), job("z", "shot-z", "1.png")], shotNumbers)
    expect(numbered[0].shotNumber).toBe(7)
    expect(numbered[1].shotNumber).toBeNull()
  })
})
