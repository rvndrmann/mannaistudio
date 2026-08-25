import { describe, expect, it } from "vitest"
import { findShotCastEntityIds, type MentionableEntity } from "./entity-mentions"
import { inheritedShotLocations } from "./shot-location"

/**
 * Which reference images a generation sends.
 *
 * This mirrors the rule in execute-generation: a hand-picked strip wins, a
 * curated cast wins, and otherwise the shot's own cast is the floor with
 * whatever the prompt names added to it.
 */
function activeReferenceIds(input: {
  prompt: string
  entities: MentionableEntity[]
  shotCastIds: string[]
  mentionedEntityIds?: string[]
  pickedIds?: string[] | null
  curated?: boolean
}) {
  const declaredIds = Array.from(new Set([...(input.mentionedEntityIds || []), ...input.shotCastIds]))
  if (input.pickedIds) return input.pickedIds
  if (input.curated) return input.shotCastIds
  const found = findShotCastEntityIds(input.prompt, input.entities, declaredIds)
  return Array.from(new Set([...found, ...declaredIds]))
}

const entities: MentionableEntity[] = [
  { id: "sara", name: "Sara", type: "character" },
  { id: "car", name: "Sleek Luxury Car", type: "prop" },
  { id: "road", name: "Sunny Urban Road", type: "scene" },
]

describe("the references a shot generates with", () => {
  // Shot 1 listed all three, and the prompt named the car only as "a dark
  // sleek modern car". The prompt matched two, won outright, and the car
  // generated with no reference at all — its approved art silently ignored.
  const shotCastIds = ["sara", "car", "road"]

  it("keeps a linked asset the prompt describes in prose rather than by name", () => {
    const ids = activeReferenceIds({
      prompt: "Tracking a dark sleek modern car down a sunny urban road, @Sara at the wheel.",
      entities,
      shotCastIds,
    })
    expect(ids).toContain("car")
    expect(ids).toEqual(expect.arrayContaining(["sara", "car", "road"]))
  })

  it("still adds an entity the prompt names that the shot did not list", () => {
    const ids = activeReferenceIds({
      prompt: "@Sara steps out onto the @Sunny Urban Road.",
      entities,
      shotCastIds: ["sara"],
      mentionedEntityIds: ["road"],
    })
    expect(ids).toEqual(expect.arrayContaining(["sara", "road"]))
  })

  it("lets a hand-picked strip override everything, including an empty one", () => {
    expect(activeReferenceIds({ prompt: "@Sara drives.", entities, shotCastIds, pickedIds: ["sara"] })).toEqual(["sara"])
    expect(activeReferenceIds({ prompt: "@Sara drives.", entities, shotCastIds, pickedIds: [] })).toEqual([])
  })

  it("uses a curated cast exactly as saved", () => {
    expect(activeReferenceIds({ prompt: "@Sara drives.", entities, shotCastIds: ["sara", "car"], curated: true }))
      .toEqual(["sara", "car"])
  })

  it("does not invent references for a shot with no cast and no mentions", () => {
    expect(activeReferenceIds({ prompt: "An empty street at dawn.", entities, shotCastIds: [] })).toEqual([])
  })
})

describe("a shot that never named its location still has one", () => {
  // Shots 2 and 3 were the car interior and the trunk POV. Neither prompt names
  // the street, so neither carried it — while shots 1, 4 and 5 did. The repair
  // existed but ran only inside create_storyboard_batch, and these shots were
  // written before the location entity existed, so there was nothing to inherit
  // and nothing ever revisited them.
  const entityRows = [{ id: "sara", type: "character" }, { id: "road", type: "scene" }]

  it("carries the scene forward across the shots between", () => {
    const repairs = inheritedShotLocations([
      { id: "s1", order_index: 0, referenced_entities: ["sara", "road"] },
      { id: "s2", order_index: 1, referenced_entities: ["sara"] },
      { id: "s3", order_index: 2, referenced_entities: ["sara"] },
      { id: "s4", order_index: 3, referenced_entities: ["sara", "road"] },
    ], entityRows)
    expect(repairs.get("s2")).toBe("road")
    expect(repairs.get("s3")).toBe("road")
    expect(repairs.has("s1")).toBe(false)
  })

  it("gives the opening shots the first location the episode names", () => {
    const repairs = inheritedShotLocations([
      { id: "s1", order_index: 0, referenced_entities: ["sara"] },
      { id: "s2", order_index: 1, referenced_entities: ["sara", "road"] },
    ], entityRows)
    expect(repairs.get("s1")).toBe("road")
  })

  it("gives a curated shot its location too, because no shot happens nowhere", () => {
    // Curation says which characters and props are in frame. It never meant
    // the shot is set nowhere, and this branch is only reached for a shot with
    // no location at all — so the old exemption just left a hole.
    const repairs = inheritedShotLocations([
      { id: "s1", order_index: 0, referenced_entities: ["sara", "road"] },
      { id: "s2", order_index: 1, referenced_entities: ["sara"], metadata: { cast_curated: true } },
    ], entityRows)
    expect(repairs.get("s2")).toBe("road")
  })

  it("leaves a curated cast alone when the project has no location to inherit", () => {
    const repairs = inheritedShotLocations([
      { id: "s1", order_index: 0, referenced_entities: ["sara"], metadata: { cast_curated: true } },
    ], [{ id: "sara", type: "character" }])
    expect(repairs.size).toBe(0)
  })
})

/**
 * Which references must be registered with the provider before sending.
 *
 * Seedance rejects an unregistered picture that may show a person, and both
 * submit paths have to agree about which pictures those are. They did not: the
 * chat path treated every shot reference as a face, while the panel's own route
 * treated only cast members that way. A character attached through the
 * multi-image strip rather than the cast therefore went as a plain URL and was
 * rejected however many times it had been verified — verification registered
 * the picture, and the request never asked for it.
 */
function facePathsFor(input: {
  castReferences: Array<{ path: string; type: string }>
  shotReferences: Array<{ path: string; registeredAssetUri?: string | null }>
}) {
  const faces = new Set<string>()
  for (const entity of input.castReferences) {
    if (entity.type === "character") faces.add(entity.path)
  }
  for (const reference of input.shotReferences) {
    // An already-registered reference carries its asset uri and has nothing
    // left to resolve.
    if (!reference.registeredAssetUri) faces.add(reference.path)
  }
  return faces
}

describe("references that must be registered before the provider sees them", () => {
  it("registers a character attached through the strip, not only the cast", () => {
    const faces = facePathsFor({
      castReferences: [{ path: "lena.png", type: "character" }],
      shotReferences: [{ path: "ethan.png" }],
    })
    expect(faces.has("ethan.png")).toBe(true)
    expect(faces.has("lena.png")).toBe(true)
  })

  it("leaves an already-registered reference alone", () => {
    const faces = facePathsFor({
      castReferences: [],
      shotReferences: [{ path: "ethan.png", registeredAssetUri: "asset://asset-1" }],
    })
    expect(faces.size).toBe(0)
  })
})
