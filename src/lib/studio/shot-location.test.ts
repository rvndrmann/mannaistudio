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

  it("never overrules a cast the user set by hand", () => {
    const repairs = inheritedShotLocations([
      shot(1, ["bathroom", "ethan"]),
      shot(2, ["ethan"], { cast_curated: true }),
      shot(3, ["ethan"]),
    ], entities)
    expect(repairs.has("shot-2")).toBe(false)
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
