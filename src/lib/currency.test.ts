import { describe, expect, it } from "vitest"
import { INR_PER_USD, formatInr, formatUsd, formatUsdWithInr, usdFromInr } from "./currency"

describe("usdFromInr", () => {
  it("rounds up, so the price shown is never under what the card is charged", () => {
    // ₹999 does not divide evenly at any plausible rate. Rounding the leftover
    // down would understate the charge; the customer should never find the
    // statement is higher than the number they agreed to.
    expect(usdFromInr(999)).toBeGreaterThanOrEqual(999 / INR_PER_USD)
    expect(usdFromInr(2_999)).toBeGreaterThanOrEqual(2_999 / INR_PER_USD)
  })

  it("keeps cents on small amounts and drops them on large ones", () => {
    expect(Number.isInteger(usdFromInr(9_999))).toBe(true)
    // ₹100 is a shade over a dollar — rounding that to $2 would nearly double it.
    expect(usdFromInr(100)).toBeLessThan(2)
  })

  it("treats a missing or nonsense price as zero rather than NaN", () => {
    expect(usdFromInr(0)).toBe(0)
    expect(usdFromInr(-5)).toBe(0)
    expect(usdFromInr(Number.NaN)).toBe(0)
  })
})

describe("formatUsd", () => {
  it("writes whole dollars without a trailing .00", () => {
    expect(formatUsd(9_999)).toMatch(/^\$[\d,]+$/)
  })

  it("keeps two decimals when the amount has cents", () => {
    expect(formatUsd(100)).toMatch(/^\$\d\.\d{2}$/)
  })
})

describe("formatUsdWithInr", () => {
  it("names the rupee amount too, since that is what the statement shows", () => {
    const label = formatUsdWithInr(2_999)
    expect(label).toContain("$")
    expect(label).toContain(formatInr(2_999))
  })
})
