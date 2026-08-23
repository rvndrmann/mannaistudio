import { describe, expect, it } from "vitest"
import { inheritedShotLocations } from "./shot-location"

/**
 * A prompt names the location only when it changes, so the shots between were
 * left with none and rendered with no location at all — the model filled the
 * gap from the background of whatever reference photo the character had, and a
 * shot set in an apartment came back in an open field.
 */

const entities = [
  { id: "bathroom", type: "scene" },
  { id: "bedroom", type: "scene" },
  { id: "hallway", type: "scene" },
  { id: "ethan", type: "character" },
  { id: "pouch", type: "prop" },
]

const shot = (order: number, cast: string[], metadata?: unknown) => ({ id: `shot-${order}`, order_index: order - 1, referenced_entities: cast, metadata })

describe("inheritedShotLocations", () => {
  it("carries the scene forward until the script moves it", () => {
    const repairs = inheritedShotLocations([
      shot(1, ["bathroom", "ethan"]),
      shot(2, ["ethan", "pouch"]),
      shot(3, ["ethan"]),
      shot(4, ["bedroom", "ethan"]),
      shot(5, ["ethan"]),
    ], entities)

    expect(Object.fromEntries(repairs)).toEqual({ "shot-2": "bathroom", "shot-3": "bathroom", "shot-5": "bedroom" })
  })

  it("leaves a shot that already names its own location alone", () => {
    const repairs = inheritedShotLocations([shot(1, ["bathroom"]), shot(2, ["hallway"])], entities)
    expect(repairs.size).toBe(0)
  })

  it("gives the opening shots the first location the episode names", () => {
    const repairs = inheritedShotLocations([
      shot(1, ["ethan"]),
      shot(2, ["ethan"]),
      shot(3, ["hallway", "ethan"]),
    ], entities)
    expect(Object.fromEntries(repairs)).toEqual({ "shot-1": "hallway", "shot-2": "hallway" })
  })

  it("gives a hand-picked cast its location too, because no shot happens nowhere", () => {
    // This used to exempt a curated cast entirely. But the exemption is only
    // ever reached for a shot carrying no location at all, so it did not
    // protect a hand-picked cast — it let a shot be set nowhere, and the model
    // then filled the gap from whatever background a reference photo had.
    //
    // Curation decides which characters and props are in frame. A location that
    // genuinely does not belong is removed on the generation card, which is a
    // per-render choice rather than a permanent hole in the storyboard.
    const repairs = inheritedShotLocations([
      shot(1, ["bathroom", "ethan"]),
      shot(2, ["ethan"], { cast_curated: true }),
      shot(3, ["ethan"]),
    ], entities)
    expect(repairs.get("shot-2")).toBe("bathroom")
    expect(repairs.get("shot-3")).toBe("bathroom")
  })

  it("has nothing to carry when the episode names no location at all", () => {
    expect(inheritedShotLocations([shot(1, ["ethan"]), shot(2, ["pouch"])], entities).size).toBe(0)
  })

  it("reads the storyboard in order however the rows arrive", () => {
    const repairs = inheritedShotLocations([
      shot(3, ["ethan"]),
      shot(1, ["bathroom", "ethan"]),
      shot(2, ["ethan"]),
    ], entities)
    expect(Object.fromEntries(repairs)).toEqual({ "shot-2": "bathroom", "shot-3": "bathroom" })
  })
})

/**
 * The case that left every shot nowhere.
 *
 * The carry-forward only works from a shot that already has a location, so an
 * episode where no prompt ever @mentions the scene filled awaitingFirst, never
 * set `carried`, and dropped the list on the way out — no shot got a location
 * at all. The storyboard then showed a cast of characters and props with no
 * place for them to be, and generation had no location reference.
 */
describe("an episode where no shot names its location", () => {
  const street = { id: "street", type: "scene" as const }
  const sara = { id: "sara", type: "character" as const }
  const car = { id: "car", type: "prop" as const }
  const shot = (id: string, order: number, cast: string[]) => ({ id, order_index: order, referenced_entities: cast })

  it("puts every shot in the project's only scene", () => {
    const repairs = inheritedShotLocations(
      [shot("a", 0, ["sara", "car"]), shot("b", 1, ["sara"]), shot("c", 2, ["car"])],
      [street, sara, car],
    )
    expect(repairs.get("a")).toBe("street")
    expect(repairs.get("b")).toBe("street")
    expect(repairs.get("c")).toBe("street")
  })

  it("does not guess when the project has more than one scene", () => {
    const trunk = { id: "trunk", type: "scene" as const }
    const repairs = inheritedShotLocations([shot("a", 0, ["sara"])], [street, trunk, sara])
    expect(repairs.size).toBe(0)
  })

  it("does nothing when the project has no scene at all", () => {
    expect(inheritedShotLocations([shot("a", 0, ["sara"])], [sara]).size).toBe(0)
  })

  it("still prefers a location a shot actually names", () => {
    const trunk = { id: "trunk", type: "scene" as const }
    const repairs = inheritedShotLocations(
      [shot("a", 0, ["trunk"]), shot("b", 1, ["sara"])],
      [street, trunk, sara],
    )
    // b inherits the trunk from a, rather than falling back to anything.
    expect(repairs.get("b")).toBe("trunk")
    expect(repairs.has("a")).toBe(false)
  })
})
