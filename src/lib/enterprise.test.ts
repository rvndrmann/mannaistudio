import { describe, expect, it } from "vitest"
import { DEFAULT_ENTERPRISE_RATE, enterpriseCreditsFor, normalizeEnterpriseRate } from "./enterprise"

describe("enterpriseCreditsFor", () => {
  it("charges 20,000 credits for one minute at the published $200 rate", () => {
    // The headline number. If this changes, the button is quoting one price and
    // the database is taking another.
    expect(enterpriseCreditsFor(1, DEFAULT_ENTERPRISE_RATE)).toBe(20_000)
  })

  it("scales with the runtime", () => {
    expect(enterpriseCreditsFor(2, 200)).toBe(40_000)
    expect(enterpriseCreditsFor(0.5, 200)).toBe(10_000)
  })

  it("follows the rate rather than assuming $200", () => {
    expect(enterpriseCreditsFor(1, 350)).toBe(35_000)
  })

  it("rounds a part credit up, never down", () => {
    // Down would sell a fractional minute for fractionally less than the rate.
    expect(enterpriseCreditsFor(0.001, 200)).toBe(20)
    expect(enterpriseCreditsFor(1.005, 199)).toBe(Math.ceil(1.005 * 199 * 100))
  })

  it("is zero for a runtime or rate that cannot be charged", () => {
    expect(enterpriseCreditsFor(0, 200)).toBe(0)
    expect(enterpriseCreditsFor(-1, 200)).toBe(0)
    expect(enterpriseCreditsFor(Number.NaN, 200)).toBe(0)
    expect(enterpriseCreditsFor(1, 0)).toBe(0)
  })
})

describe("normalizeEnterpriseRate", () => {
  it("falls back to the published rate for anything unusable", () => {
    expect(normalizeEnterpriseRate(null).usdPerMinute).toBe(DEFAULT_ENTERPRISE_RATE)
    expect(normalizeEnterpriseRate({ usdPerMinute: -5 }).usdPerMinute).toBe(DEFAULT_ENTERPRISE_RATE)
    expect(normalizeEnterpriseRate({ usdPerMinute: "200" }).usdPerMinute).toBe(DEFAULT_ENTERPRISE_RATE)
  })

  it("keeps a rate an admin actually set", () => {
    expect(normalizeEnterpriseRate({ usdPerMinute: 350, enabled: false }).usdPerMinute).toBe(350)
    expect(normalizeEnterpriseRate({ usdPerMinute: 350, enabled: false }).enabled).toBe(false)
  })
})
