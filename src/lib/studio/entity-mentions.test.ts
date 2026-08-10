import { describe, expect, it } from "vitest"
import { buildEntityMentionContext, findActiveEntityMention, findMentionedEntityIds, insertEntityMention, type MentionableEntity } from "./entity-mentions"

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
