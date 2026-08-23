import { describe, expect, it } from "vitest"
import { buildEntityMentionContext, findActiveEntityMention, findMentionedEntityIds, insertEntityMention, type MentionableEntity, entityPrimaryReference, findShotCastEntityIds , chosenReferences } from "./entity-mentions"

const entities: MentionableEntity[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Maya", type: "character", description: "Lead detective" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Maya's Car", type: "prop" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Old Station", type: "scene" },
]

describe("entity mentions", () => {
  it("resolves exact canonical names, including names with spaces", () => {
    expect(findMentionedEntityIds("Place @Maya in @Old Station beside @Maya's Car.", entities)).toEqual([
      entities[0].id,
      entities[2].id,
      entities[1].id,
    ])
  })

  it("does not resolve partial entity names", () => {
    expect(findMentionedEntityIds("Show @May and @Old", entities)).toEqual([])
  })

  it("detects and inserts an active mention", () => {
    const active = findActiveEntityMention("Create an image with @May", 25)
    expect(active).toEqual({ start: 21, end: 25, query: "May" })
    expect(insertEntityMention("Create an image with @May", entities[0], active!)).toEqual({
      value: "Create an image with @Maya ",
      caret: 27,
    })
  })

  it("builds authoritative model context including reference art status", () => {
    const context = buildEntityMentionContext([entities[0]])
    expect(context).toContain(`@Maya [character] id=${entities[0].id} (NO reference image yet): Lead detective`)
    expect(context).toContain("Offer to generate one before using them in a shot")
  })

  it("reports available art and directs the model to reuse it", () => {
    const withArt = { ...entities[0], reference_images: ["a.png", "b.png"] }
    const context = buildEntityMentionContext([withArt])
    expect(context).toContain("(2 reference images available)")
    expect(context).toContain("Reuse it for visual consistency")
  })
})

describe("chosen entity reference", () => {
  it("uses the explicitly chosen image over saved order", () => {
    expect(entityPrimaryReference({ reference_images: ["a.png", "b.png"], primary_reference_image: "b.png" })).toBe("b.png")
  })

  it("falls back to the first image when nothing was chosen", () => {
    expect(entityPrimaryReference({ reference_images: ["a.png", "b.png"] })).toBe("a.png")
    expect(entityPrimaryReference({ reference_images: ["a.png"], primary_reference_image: null })).toBe("a.png")
  })

  it("ignores a choice the entity no longer owns, so a deleted image cannot be sent", () => {
    expect(entityPrimaryReference({ reference_images: ["a.png"], primary_reference_image: "gone.png" })).toBe("a.png")
  })

  it("has no reference when the entity has no images", () => {
    expect(entityPrimaryReference({ reference_images: [], primary_reference_image: "x.png" })).toBeUndefined()
  })
})

describe("shot cast", () => {
  const cast = [
    { id: "c1", name: "Lena", type: "character" as const },
    { id: "c2", name: "Ethan", type: "character" as const },
    { id: "s1", name: "Bedroom", type: "scene" as const },
    { id: "p1", name: "Suitcase", type: "prop" as const },
    { id: "p2", name: "Ritual Note", type: "prop" as const },
  ]

  it("takes @mentions without needing them declared", () => {
    expect(findShotCastEntityIds("@Lena packs while @Ethan waits", cast)).toEqual(["c1", "c2"])
  })

  it("recovers a location named in prose when the shot declared it", () => {
    // The prompt says "bedroom", not "@Bedroom", which is how a scene usually
    // reads — but it is still genuinely referenced.
    const ids = findShotCastEntityIds("@Lena packs in the bedroom", cast, ["s1"])
    expect(ids).toContain("s1")
  })

  it("ignores a declared entity the prompt never names", () => {
    const ids = findShotCastEntityIds("@Lena packs in the bedroom", cast, ["s1", "p2"])
    expect(ids).not.toContain("p2")
  })

  it("does not invent a cast from prose alone when nothing was declared", () => {
    expect(findShotCastEntityIds("a suitcase sits in the bedroom", cast)).toEqual([])
  })
})

describe("reference budget", () => {
  const entity = (name: string, images: string[]) => ({ id: name, name, type: "character" as const, reference_images: images })

  // An entity's other images are the attempts the user rejected — that is what
  // the Choose button settles. The models blend every reference into one output,
  // so a reject sent alongside the keeper averages the face the user picked with
  // the ones they threw away.
  it("sends only the chosen image for each entity", () => {
    expect(chosenReferences([
      entity("Ethan", ["ethan-keeper.png", "ethan-rejected.png", "ethan-rejected-2.png"]),
      entity("Lena", ["lena-keeper.png", "lena-rejected.png"]),
    ], 16)).toEqual(["ethan-keeper.png", "lena-keeper.png"])
  })

  it("honours an explicitly chosen reference over list order", () => {
    expect(chosenReferences([
      { id: "e", name: "Ethan", type: "character", reference_images: ["old.png", "picked.png"], primary_reference_image: "picked.png" },
    ], 16)).toEqual(["picked.png"])
  })

  it("spends the budget on subjects, cutting the last of a very large cast", () => {
    const cast = Array.from({ length: 20 }, (_, index) => entity(`Extra ${index}`, [`extra-${index}.png`]))
    expect(chosenReferences(cast, 16)).toHaveLength(16)
  })

  it("skips entities with no art and never repeats a shared image", () => {
    expect(chosenReferences([
      entity("Ghost", []),
      entity("Lena", ["shared.png"]),
      entity("Twin", ["shared.png"]),
    ], 8)).toEqual(["shared.png"])
  })
})

/**
 * The inheritance that undid itself.
 *
 * A prompt names a place only where it changes, which is why the location is
 * carried onto the shots in between. But the cast was then recomputed from the
 * prompt, keeping a declared entity only when its name appeared in the text —
 * so the scene the repair had just added was dropped again for exactly the
 * reason it was added. The storyboard showed a cast with nowhere to be, and
 * generation, which reads the cast through the same function, sent no location.
 */
describe("a declared location survives the cast filter", () => {
  const street = { id: "street", name: "Modern Roadway Day", type: "scene" as const }
  const sara = { id: "sara", name: "Sara", type: "character" as const }
  const car = { id: "car", name: "Luxury Car", type: "prop" as const }
  const cast = [street, sara, car]

  it("keeps the scene even though the prompt never names it", () => {
    const ids = findShotCastEntityIds("Wide aerial of @Luxury Car with @Sara at the wheel.", cast, ["street", "sara", "car"])
    expect(ids).toContain("street")
    expect(ids).toContain("sara")
    expect(ids).toContain("car")
  })

  it("still drops a declared prop the prompt does not name", () => {
    const trunk = { id: "trunk", name: "Car Trunk", type: "prop" as const }
    const ids = findShotCastEntityIds("@Sara at the wheel.", [...cast, trunk], ["sara", "trunk"])
    expect(ids).toContain("sara")
    expect(ids).not.toContain("trunk")
  })

  it("does not invent a scene that was never declared", () => {
    expect(findShotCastEntityIds("@Sara at the wheel.", cast, ["sara"])).not.toContain("street")
  })
})
