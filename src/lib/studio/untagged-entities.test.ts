import { describe, expect, it } from "vitest"
import { describeUntaggedEntities, findUntaggedEntities } from "./untagged-entities"
import type { MentionableEntity } from "./entity-mentions"

const entity = (name: string, type: MentionableEntity["type"], art = ["ref.png"]): MentionableEntity =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, type, reference_images: art })

const cast = [
  entity("Sara", "character"),
  entity("Sleek Luxury Car", "prop"),
  entity("Sunny Urban Street", "scene"),
]

describe("catching an asset the prompt describes instead of tagging", () => {
  it("finds the asset named in words while the character is tagged", () => {
    // The real prompt this was written for: @Sara bound to her photograph, the
    // car and the street shipping as pictures nothing pointed at.
    const prompt = "Eye-level tracking shot of the Sleek Luxury Car on the Sunny Urban Street, @Sara at the wheel."
    expect(findUntaggedEntities(prompt, cast).map((e) => e.name)).toEqual(["Sleek Luxury Car", "Sunny Urban Street"])
  })

  it("passes a prompt where every subject is tagged", () => {
    const prompt = "@Sara drives the @Sleek Luxury Car down @Sunny Urban Street."
    expect(findUntaggedEntities(prompt, cast)).toEqual([])
  })

  it("does not fire on an entity with no reference art to bind to", () => {
    // Nothing has been drawn, so there is no picture the prose is failing to
    // point at. Blocking here would refuse work that is perfectly correct.
    const briefcase = entity("Briefcase", "prop", [])
    expect(findUntaggedEntities("@Sara opens the Briefcase.", [...cast, briefcase])).toEqual([])
  })

  it("counts a tagged mention even when the same name also appears as prose", () => {
    // The tag is present, so the binding will happen; the loose mention rides
    // along with it rather than being a separate unbound subject.
    expect(findUntaggedEntities("@Sara turns. Sara smiles.", cast)).toEqual([])
  })

  it("ignores a name that is only part of a longer word", () => {
    expect(findUntaggedEntities("The saraband played on.", [entity("Sara", "character")])).toEqual([])
  })

  it("ignores very short names, which match too much to be safe", () => {
    expect(findUntaggedEntities("It was always there.", [entity("Al", "character")])).toEqual([])
  })

  it("matches case-insensitively", () => {
    expect(findUntaggedEntities("the sleek luxury car pulls away", cast).map((e) => e.name)).toEqual(["Sleek Luxury Car"])
  })

  it("says nothing about an empty prompt", () => {
    expect(findUntaggedEntities("", cast)).toEqual([])
    expect(findUntaggedEntities("   ", cast)).toEqual([])
  })

  it("says nothing when the project has no entities", () => {
    expect(findUntaggedEntities("A car on a street.", [])).toEqual([])
  })
})

describe("the refusal tells the writer what to do", () => {
  it("names the asset and the tag to use", () => {
    const message = describeUntaggedEntities(findUntaggedEntities("The Sleek Luxury Car pulls away.", cast), "Shot 1's video prompt")
    expect(message).toContain("Shot 1's video prompt")
    expect(message).toContain('"Sleek Luxury Car" (write @Sleek Luxury Car)')
  })

  it("explains why it matters rather than only stating the rule", () => {
    const message = describeUntaggedEntities(findUntaggedEntities("The Sleek Luxury Car pulls away.", cast), "This prompt")
    expect(message).toMatch(/binds a subject to its reference image/i)
  })

  it("is empty when there is nothing to report", () => {
    expect(describeUntaggedEntities([], "Shot 1")).toBe("")
  })
})
