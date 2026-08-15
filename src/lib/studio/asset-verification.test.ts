import { describe, expect, it } from "vitest"
import { assetVerificationFor, UNVERIFIED_ASSET, VERIFIED_ASSET } from "./asset-verification"

/**
 * These three fields have to agree, and they were bare string literals in six
 * files. A typo in any of them produced a character that reads as unverified
 * forever with nothing failing at build time — so the spellings are pinned
 * here, and the exported constants are what the routes actually write.
 */

describe("asset verification vocabulary", () => {
  it("pins the spellings the database and provider expect", () => {
    expect(VERIFIED_ASSET).toEqual({
      source_type: "byteplus_virtual_portrait",
      byteplus_asset_class: "private_virtual_portrait",
      verification_status: "verified",
    })
    expect(UNVERIFIED_ASSET).toEqual({
      source_type: "external_untrusted",
      byteplus_asset_class: "untrusted_external",
      verification_status: "unverified",
    })
  })

  it("treats an entity holding an asset id as verified", () => {
    expect(assetVerificationFor("asset-20260222234430-mxpgh")).toBe(VERIFIED_ASSET)
  })

  it("treats a missing, empty, or null asset id as unverified", () => {
    expect(assetVerificationFor(null)).toBe(UNVERIFIED_ASSET)
    expect(assetVerificationFor(undefined)).toBe(UNVERIFIED_ASSET)
    expect(assetVerificationFor("")).toBe(UNVERIFIED_ASSET)
  })
})
