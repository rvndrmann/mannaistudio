import { describe, expect, it } from "vitest"
import {
  applyBrandProfileUpdate,
  brandAssetToolSchema,
  brandFunctionDefinitions,
  brandHandoffSchema,
  brandTeamRoster,
  describeBrandToolResult,
} from "./brand-tools"

const blank = {
  tagline: "",
  website_url: "",
  industry: "",
  description: "",
  brand_voice: "",
  audience: "",
  positioning: "",
  goals: "",
  offer: "",
  visual_style: "",
  do_rules: "",
  dont_rules: "",
  color_palette: [] as string[],
  forbidden_claims: [] as string[],
}

describe("applyBrandProfileUpdate", () => {
  it("fills blank fields from what the agent learned", () => {
    const { updates, skipped } = applyBrandProfileUpdate(blank, { goals: "Launch cold brew on Reels.", audience: "Home brewers 25-40." })
    expect(updates).toEqual({ goals: "Launch cold brew on Reels.", audience: "Home brewers 25-40." })
    expect(skipped).toEqual([])
  })

  it("refuses to overwrite an answer the user already gave", () => {
    const current = { ...blank, goals: "My own carefully written goal." }
    const { updates, skipped } = applyBrandProfileUpdate(current, { goals: "Something the agent inferred.", offer: "Free shipping." })
    expect(updates).toEqual({ offer: "Free shipping." })
    expect(skipped).toEqual(["goals"])
  })

  it("overwrites only when the change was explicitly asked for", () => {
    const current = { ...blank, goals: "Old goal." }
    const { updates, skipped } = applyBrandProfileUpdate(current, { goals: "New goal." }, true)
    expect(updates).toEqual({ goals: "New goal." })
    expect(skipped).toEqual([])
  })

  it("treats an unchanged value as nothing to do rather than as a blocked write", () => {
    const current = { ...blank, offer: "Free shipping." }
    const { updates, skipped } = applyBrandProfileUpdate(current, { offer: " Free shipping. " })
    expect(updates).toEqual({})
    expect(skipped).toEqual([])
  })

  it("ignores blanks, so an agent cannot erase a field by sending an empty string", () => {
    const current = { ...blank, positioning: "The roast you can taste the origin in." }
    const { updates } = applyBrandProfileUpdate(current, { positioning: "   ", forbidden_claims: [] }, true)
    expect(updates).toEqual({})
  })

  it("handles list fields on the same empty-means-free rule", () => {
    expect(applyBrandProfileUpdate(blank, { forbidden_claims: ["cures fatigue"] }).updates).toEqual({ forbidden_claims: ["cures fatigue"] })
    const filled = { ...blank, forbidden_claims: ["already here"] }
    expect(applyBrandProfileUpdate(filled, { forbidden_claims: ["new claim"] }).skipped).toEqual(["forbidden_claims"])
  })

  it("never writes a field that is not the agent's to write", () => {
    const { updates } = applyBrandProfileUpdate(blank, { name: "Renamed by the agent", kind: "show", id: "other" } as Record<string, unknown>)
    expect(updates).toEqual({})
  })
})

describe("brandFunctionDefinitions", () => {
  it("offers exactly the five brand tools", () => {
    expect(brandFunctionDefinitions().map((tool) => tool.name)).toEqual([
      "update_brand_profile",
      "save_brand_knowledge",
      "save_brand_asset",
      "hand_off_to_agent",
      "read_brand_website",
    ])
  })

  it("only lets an asset be filed under a kind the library actually has", () => {
    const asset = brandFunctionDefinitions().find((tool) => tool.name === "save_brand_asset")
    const kind = (asset?.parameters.properties as unknown as Record<string, { enum?: string[] }>).kind
    expect(kind.enum).toEqual(["logo", "product", "character", "location", "reference"])
  })

  it("does not let an agent rename the brand through the profile tool", () => {
    const properties = brandFunctionDefinitions()[0].parameters.properties as Record<string, unknown>
    expect(properties.name).toBeUndefined()
    expect(properties.goals).toBeDefined()
    expect(properties.overwrite).toBeDefined()
  })
})

describe("brandTeamRoster", () => {
  const agents = [
    { agent_key: "content_strategist", name: "Content Strategist", role_summary: "Plans the angle.", writes_script: false },
    { agent_key: "script_writer", name: "Script Writer", role_summary: "Writes the script.", writes_script: true },
  ]

  it("lists the other agents so a handover names a real one", () => {
    const roster = brandTeamRoster(agents, "content_strategist")
    expect(roster).toContain("script_writer — Script Writer: Writes the script.")
    expect(roster).not.toContain("content_strategist —")
  })

  it("says there is nobody to hand to when the agent is alone", () => {
    expect(brandTeamRoster([agents[0]], "content_strategist")).toContain("only agent on this brand")
  })
})

describe("brandHandoffSchema", () => {
  it("requires a target and defaults the brief", () => {
    expect(brandHandoffSchema.parse({ agent_key: "script_writer" })).toEqual({ agent_key: "script_writer", brief: "" })
    expect(() => brandHandoffSchema.parse({ brief: "write it" })).toThrow()
  })
})

describe("describeBrandToolResult", () => {
  it("says what was saved, and what was left alone", () => {
    expect(describeBrandToolResult("update_brand_profile", { updated: ["goals", "brand_voice"], skipped: [] })).toBe("Saved to the brand: goals, brand voice.")
    expect(describeBrandToolResult("update_brand_profile", { updated: [], skipped: ["goals"] })).toBe("Left your existing goals alone.")
    expect(describeBrandToolResult("update_brand_profile", { updated: [], skipped: [] })).toBe("")
  })

  it("names both sides of a handover", () => {
    expect(describeBrandToolResult("hand_off_to_agent", { from: "Content Strategist", to: "Script Writer" })).toBe("Content Strategist handed this to Script Writer.")
  })

  it("reports a website read, and says when it failed", () => {
    expect(describeBrandToolResult("read_brand_website", { pagesRead: 3 })).toBe("Read 3 pages of the website.")
    expect(describeBrandToolResult("read_brand_website", { error: "The website did not respond." })).toContain("Could not read the website")
  })
})

describe("brandAssetToolSchema", () => {
  it("takes an attachment by position, with a kind and a name", () => {
    expect(brandAssetToolSchema.parse({ attachment: 2, kind: "character", name: "Maya" })).toEqual({
      attachment: 2,
      kind: "character",
      name: "Maya",
      description: "",
    })
  })

  it("refuses a kind the library cannot render", () => {
    expect(() => brandAssetToolSchema.parse({ attachment: 1, kind: "mood", name: "Vibes" })).toThrow()
  })

  it("refuses an attachment number that could not have been shown", () => {
    expect(() => brandAssetToolSchema.parse({ attachment: 0, kind: "product", name: "Bottle" })).toThrow()
    expect(() => brandAssetToolSchema.parse({ attachment: 99, kind: "product", name: "Bottle" })).toThrow()
  })
})

describe("describeBrandToolResult for assets", () => {
  it("says what was filed and as what", () => {
    expect(describeBrandToolResult("save_brand_asset", { name: "Cold Brew Bottle", kind: "product" }))
      .toBe("Filed Cold Brew Bottle in the asset library as a product.")
  })

  it("passes on why a file was refused", () => {
    expect(describeBrandToolResult("save_brand_asset", { error: 'That image is already in the library as "Bottle".' }))
      .toContain("already in the library")
  })
})
