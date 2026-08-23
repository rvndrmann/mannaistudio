import { describe, expect, it } from "vitest"
import { budgetForTool, isPruned, pruneToolOutput, serializeToolOutput } from "./tool-result-budget"

const points = (value: string) => Array.from(value).length

describe("a result small enough to carry is left exactly as it is", () => {
  it("returns short output untouched", () => {
    const output = JSON.stringify({ shots: [{ id: "a", prompt: "Rainy New York morning." }] })
    expect(pruneToolOutput(output)).toEqual({ output, pruned: false, omitted: 0 })
  })

  it("leaves a result sitting exactly on the threshold alone", () => {
    const output = "x".repeat(8_192)
    expect(pruneToolOutput(output).pruned).toBe(false)
  })

  it("cuts the very next character past it", () => {
    const output = "x".repeat(8_193)
    expect(pruneToolOutput(output).pruned).toBe(true)
  })
})

describe("an oversized result keeps both of its ends", () => {
  // The head carries the shape of the result and its first rows; the tail
  // carries the counts, ids and error fields JSON puts last. A plain
  // truncation keeps the first and throws away the second.
  const body = `{"head":"${"H".repeat(20_000)}","tail":"${"T".repeat(20_000)}","total":47}`

  it("keeps the opening", () => {
    expect(pruneToolOutput(body).output.startsWith('{"head":"HHHH')).toBe(true)
  })

  it("keeps the closing", () => {
    expect(pruneToolOutput(body).output.endsWith('"total":47}')).toBe(true)
  })

  it("reports what it removed", () => {
    const result = pruneToolOutput(body)
    expect(result.omitted).toBe(points(body) - 4_096 - 1_024)
    expect(points(result.output)).toBeLessThan(points(body))
  })

  it("names the step to read the rest from when it knows it", () => {
    expect(pruneToolOutput(body, { stepSequence: 4 }).output).toContain("stepSequence 4")
  })

  it("says nothing about a step it was not given", () => {
    expect(pruneToolOutput(body).output).not.toContain("stepSequence")
  })
})

describe("pruning the same text twice changes nothing the second time", () => {
  // Stored conversations are replayed through this on every follow-up turn. A
  // second pass that cut again would eat a further 3k characters per turn and
  // eventually nest a marker inside a marker.
  const body = "y".repeat(40_000)

  it("is idempotent", () => {
    const once = pruneToolOutput(body).output
    const twice = pruneToolOutput(once).output
    expect(twice).toBe(once)
  })

  it("reports the second pass as having pruned nothing", () => {
    const once = pruneToolOutput(body).output
    expect(pruneToolOutput(once)).toEqual({ output: once, pruned: false, omitted: 0 })
  })

  it("recognises its own marker", () => {
    expect(isPruned(pruneToolOutput(body).output)).toBe(true)
    expect(isPruned(body)).toBe(false)
  })
})

describe("the cut never lands inside a character", () => {
  it("does not split a surrogate pair", () => {
    // "🎬" is two UTF-16 units. Slicing by .length at an odd offset leaves a
    // lone surrogate, which is not valid text and breaks a JSON parse.
    const body = "🎬".repeat(20_000)
    const result = pruneToolOutput(body, { threshold: 100, head: 51, tail: 7 })
    expect(result.pruned).toBe(true)
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(result.output)).toBe(false)
    expect(result.output.startsWith("🎬".repeat(51))).toBe(true)
    expect(result.output.endsWith("🎬".repeat(7))).toBe(true)
  })

  it("counts in code points, not UTF-16 units", () => {
    // 5,000 emoji are 10,000 UTF-16 units but only 5,000 code points, so this
    // sits under the threshold and must not be cut.
    expect(pruneToolOutput("🎬".repeat(5_000)).pruned).toBe(false)
  })
})

describe("a budget wider than the text stamps no marker", () => {
  it("refuses to claim a cut it did not make", () => {
    const body = "z".repeat(9_000)
    expect(pruneToolOutput(body, { threshold: 10, head: 8_000, tail: 8_000 })).toEqual({ output: body, pruned: false, omitted: 0 })
  })
})

describe("the documents the model is meant to actually read get room", () => {
  it("gives the master prompt a budget that carries a real one", () => {
    expect(budgetForTool("read_episode_master_prompt").head).toBe(56_000)
  })

  it("leaves an ordinary tool on the default", () => {
    expect(budgetForTool("list_storyboard_shots")).toEqual({})
  })

  it("applies the per-tool budget through serializeToolOutput", () => {
    const master = { body: "M".repeat(30_000) }
    expect(serializeToolOutput(master, { tool: "read_episode_master_prompt" }).pruned).toBe(false)
    expect(serializeToolOutput(master, { tool: "list_storyboard_shots" }).pruned).toBe(true)
  })

  it("lets an explicit option override the per-tool budget", () => {
    const master = { body: "M".repeat(30_000) }
    expect(serializeToolOutput(master, { tool: "read_episode_master_prompt", threshold: 100, head: 50, tail: 20 }).pruned).toBe(true)
  })
})

describe("serializing a result that cannot be serialized does not lose the turn", () => {
  it("reports the failure as something the model can act on", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const result = serializeToolOutput(circular)
    expect(result.pruned).toBe(false)
    expect(JSON.parse(result.output).note).toContain("could not be carried")
  })

  it("carries undefined as null rather than as the string undefined", () => {
    expect(serializeToolOutput(undefined).output).toBe("null")
  })
})
