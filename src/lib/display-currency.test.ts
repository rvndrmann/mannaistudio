import { describe, expect, it } from "vitest"
import { formatInr, formatUsdFromInr, PRO_PRICE_INR, PRO_PRICE_USD_LABEL, showRupeesAsDollars, usdFromInr } from "./display-currency"

describe("showing a rupee price in dollars", () => {
  it("shows Pro as the dollar reading of what is charged", () => {
    expect(PRO_PRICE_INR).toBe(799)
    expect(usdFromInr(799)).toBe(8.38)
    expect(PRO_PRICE_USD_LABEL).toBe("$8.38")
  })

  it("rounds up, to the cent under ten dollars and to the dollar above", () => {
    expect(formatUsdFromInr(954)).toBe("$10")
    expect(formatUsdFromInr(7999)).toBe("$84")
    expect(formatUsdFromInr(0)).toBe("$0")
  })

  it("states the charge itself in rupees, grouped the Indian way", () => {
    expect(formatInr(799)).toBe("₹799")
    expect(formatInr(125000)).toBe("₹1,25,000")
  })

  it("rewrites rupee amounts an admin typed into a sentence", () => {
    expect(showRupeesAsDollars("Limited offer: AI Director Hub Pro for ₹799/month")).toBe("Limited offer: AI Director Hub Pro for $8.38/month")
    expect(showRupeesAsDollars("Was ₹7,999, now Rs. 799")).toBe("Was $84, now $8.38")
    expect(showRupeesAsDollars("No prices here")).toBe("No prices here")
  })
})
