import { describe, expect, it } from "vitest"
import { parseSeedanceRejectedReference, seedanceReferenceAssetUri } from "./seedance-reference-error"

describe("Seedance rejected reference errors", () => {
  it("maps BytePlus content indexes past the text prompt", () => {
    expect(parseSeedanceRejectedReference("input image 'content[4]' may contain real person")).toEqual({
      contentIndex: 4,
      referenceIndex: 3,
    })
  })

  it("ignores unrelated errors and the prompt item", () => {
    expect(parseSeedanceRejectedReference("content[2] is an unsupported image format")).toBeNull()
    expect(parseSeedanceRejectedReference("content[0] may contain real person")).toBeNull()
  })

  it("reads persisted asset mappings", () => {
    expect(seedanceReferenceAssetUri({ assetUri: "asset://portrait-1" })).toBe("asset://portrait-1")
    expect(seedanceReferenceAssetUri("asset://portrait-2")).toBe("asset://portrait-2")
    expect(seedanceReferenceAssetUri({ assetUri: "https://example.com/image.jpg" })).toBeNull()
  })
})
