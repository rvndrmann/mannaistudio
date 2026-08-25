import { describe, expect, it } from "vitest"
import { isFreeCourse } from "./course-price"

describe("isFreeCourse", () => {
  it.each(["Free", "free", "FREE", " Free "])("reads %o as free, however it was typed", (price) => {
    expect(isFreeCourse(price)).toBe(true)
  })

  it.each(["$0", "0", "₹0", "0.00", "$0.00"])("reads %o as free", (price) => {
    expect(isFreeCourse(price)).toBe(true)
  })

  it.each([null, undefined, "", "   ", 0])("reads %o as free, since nothing was charged", (price) => {
    expect(isFreeCourse(price)).toBe(true)
  })

  it.each(["$49", "49", "₹1999", "$0.99", 49])("reads %o as paid", (price) => {
    expect(isFreeCourse(price)).toBe(false)
  })

  it("does not treat unparseable text as free", () => {
    // The bug this came from was the opposite mistake — Number("Free") is NaN,
    // and a NaN comparison silently answered "not free" for the one course
    // that was. Neither direction may be guessed.
    expect(isFreeCourse("contact us")).toBe(false)
    expect(isFreeCourse({})).toBe(false)
  })
})
