import { describe, expect, it } from "vitest"
import {
  briefDigest, creativeBriefFromManagedBrief, emptyManagedBrief,
  managedBriefSchema, parseManagedBrief, repeatBriefFrom,
} from "./managed-brief"

const FULL = managedBriefSchema.parse({
  brandName: "Acme",
  brandWebsite: "https://acme.test",
  productName: "Glow Serum",
  productDescription: "A vitamin C serum for dull skin.",
  industry: "Beauty",
  goal: "Generate sales",
  goalNotes: "Push the Diwali stock.",
  audience: "Women who already buy skincare online",
  market: "India",
  ageRange: "25-40",
  painPoint: "Dull skin after long office hours",
  whyBuy: "Visible results in two weeks",
  styles: ["Problem → Solution", "Creator testimonial"],
  mustInclude: "Show the dropper",
  mustAvoid: "No before/after claims",
  referenceLinks: ["https://example.test/ad"],
  price: "₹1,499",
  offer: "Buy 2 get 1 free",
  discount: "20% off",
  cta: "Shop Now",
  landingPageUrl: "https://acme.test/serum",
  platforms: ["Instagram", "TikTok"],
  notes: "Deliver before the 20th.",
  attachments: [{ path: "managed/x/uploads/bottle.png", name: "bottle.png", contentType: "image/png", kind: "product_image" }],
})

describe("parseManagedBrief", () => {
  it("keeps what it is given", () => {
    expect(parseManagedBrief(FULL).brandName).toBe("Acme")
  })

  it("falls back to an empty brief rather than throwing on junk", () => {
    // A brief that fails to parse must not take a paid project's page down
    // with it; an empty one renders as "nothing recorded".
    expect(parseManagedBrief(null)).toEqual(emptyManagedBrief())
    expect(parseManagedBrief({ brandName: 42 })).toEqual(emptyManagedBrief())
    expect(parseManagedBrief("not an object")).toEqual(emptyManagedBrief())
  })

  it("accepts a brief with nothing filled in", () => {
    // Every field is optional on purpose: refusing an order over a blank
    // "gender if relevant" loses the order.
    expect(() => managedBriefSchema.parse({})).not.toThrow()
  })
})

describe("creativeBriefFromManagedBrief", () => {
  const brief = creativeBriefFromManagedBrief(FULL, {
    serviceName: "UGC Ads",
    durationSeconds: 30,
    aspectRatio: "9:16",
  })

  it("carries the goal, the product and the offer into the Director's brief", () => {
    expect(brief.objective).toContain("UGC Ads")
    expect(brief.objective).toContain("Generate sales")
    expect(brief.productOrService).toContain("Glow Serum")
    expect(brief.offer).toContain("Buy 2 get 1 free")
    expect(brief.offer).toContain("Shop Now")
  })

  it("folds the audience answers into one paragraph", () => {
    expect(brief.audience).toContain("India")
    expect(brief.audience).toContain("25-40")
    expect(brief.audience).toContain("Dull skin")
  })

  it("keeps the must-include and must-avoid rules with the style", () => {
    expect(brief.style).toContain("Problem → Solution")
    expect(brief.style).toContain("Show the dropper")
    expect(brief.style).toContain("No before/after claims")
  })

  it("takes duration and ratio from the order, never from the brief text", () => {
    expect(brief.durationSeconds).toBe(30)
    expect(brief.aspectRatio).toBe("9:16")
  })

  it("marks the answered fields confirmed so the Director produces rather than asks", () => {
    expect(brief.confirmedFields).toContain("objective")
    expect(brief.confirmedFields).toContain("audience")
    expect(brief.confirmedFields).toContain("offer")
  })

  it("survives an empty brief", () => {
    const blank = creativeBriefFromManagedBrief(emptyManagedBrief(), {
      serviceName: "Cinematic Product Ads",
      durationSeconds: 60,
      aspectRatio: "16:9",
    })
    expect(blank.durationSeconds).toBe(60)
    expect(blank.objective).toContain("Cinematic Product Ads")
  })
})

describe("briefDigest", () => {
  it("lists only the questions that were answered", () => {
    const digest = briefDigest(FULL)
    expect(digest).toContain("Brand: Acme")
    expect(digest).toContain("Must avoid: No before/after claims")
    expect(digest).not.toContain("Gender:")
  })

  it("is empty when nothing was filled in", () => {
    expect(briefDigest(emptyManagedBrief())).toBe("")
  })
})

describe("repeatBriefFrom", () => {
  const repeat = repeatBriefFrom(FULL)

  it("carries the parts of a brand that do not change", () => {
    expect(repeat.brandName).toBe("Acme")
    expect(repeat.productName).toBe("Glow Serum")
    expect(repeat.audience).toBe(FULL.audience)
    expect(repeat.platforms).toEqual(["Instagram", "TikTok"])
  })

  it("drops what a new campaign is actually about", () => {
    // Quietly repeating last month's sale is worse than an empty field.
    expect(repeat.offer).toBe("")
    expect(repeat.discount).toBe("")
    expect(repeat.goal).toBe("")
    expect(repeat.styles).toEqual([])
    expect(repeat.cta).toBe("")
  })

  it("drops the previous campaign's files", () => {
    // A product shot from a previous campaign is usually the wrong one, and
    // the paths belong to the other project's folder anyway.
    expect(repeat.attachments).toEqual([])
  })
})
