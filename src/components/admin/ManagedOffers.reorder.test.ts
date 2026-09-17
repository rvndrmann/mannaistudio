import { describe, expect, it } from "vitest"
import { reorder } from "./ManagedOffers"

/**
 * The list move behind the up/down arrows in Admin → Managed Production →
 * Offers. Pure, so the ordering rule can be checked without a browser; the RPC
 * it feeds writes `position` from the array it returns, which is why an
 * out-of-range move has to return the list untouched rather than a shorter one.
 */
describe("reorder", () => {
  const list = ["a", "b", "c", "d"]

  it("moves an item up", () => {
    expect(reorder(list, 2, 1)).toEqual(["a", "c", "b", "d"])
  })

  it("moves an item down", () => {
    expect(reorder(list, 0, 1)).toEqual(["b", "a", "c", "d"])
  })

  it("moves across the whole list, not just by one", () => {
    expect(reorder(list, 3, 0)).toEqual(["d", "a", "b", "c"])
  })

  it("leaves the list alone when the move goes nowhere", () => {
    expect(reorder(list, 1, 1)).toBe(list)
  })

  // The arrows are disabled at the ends, but a caller that ignores that must
  // not be able to drop an item: the result is written straight to `position`.
  it("refuses a move off either end without losing anything", () => {
    expect(reorder(list, 0, -1)).toBe(list)
    expect(reorder(list, 3, 4)).toBe(list)
    expect(reorder(list, 9, 0)).toBe(list)
  })

  it("does not mutate the list it was given", () => {
    const original = [...list]
    reorder(list, 0, 3)
    expect(list).toEqual(original)
  })
})
