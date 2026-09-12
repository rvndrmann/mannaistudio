import { describe, expect, it } from "vitest"
import { isSeedanceRejectedVideo, parseSeedanceMissingAssetError, parseSeedanceRejectedReference, seedanceReferenceAssetUri, seedanceCopyrightRefusal } from "./seedance-reference-error"

describe("Seedance rejected reference errors", () => {
  it("parses a rejected motion video with isVideo: true", () => {
    const message = "BytePlus request failed (400): The request failed because the input video 'content[5]' may contain real person."
    expect(isSeedanceRejectedVideo(message)).toBe(true)
    expect(parseSeedanceRejectedReference(message)).toEqual({
      contentIndex: 5,
      referenceIndex: 4,
      isVideo: true,
    })
    expect(isSeedanceRejectedVideo("input image 'content[5]' may contain real person")).toBe(false)
  })
  it("maps BytePlus content indexes past the text prompt", () => {
    expect(parseSeedanceRejectedReference("input image 'content[4]' may contain real person")).toEqual({
      contentIndex: 4,
      referenceIndex: 3,
      isVideo: false,
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

  it("parses missing BytePlus asset errors", () => {
    const errorStr = "BytePlus request failed (400): The parameter content[1].image_url.url specified in the request is not valid: The specified asset asset-20260813042018-j2gsl is not found. Request id: redacted"
    expect(parseSeedanceMissingAssetError(errorStr)).toEqual({
      assetId: "asset-20260813042018-j2gsl",
      contentIndex: 1,
      referenceIndex: 0,
    })
  })
})

describe("the copyright refusal", () => {
  it("explains the output filter, not the references", () => {
    const raw = "The request failed because the output video may be related to copyright restrictions. Request id: 0217891805143730000"
    const explained = seedanceCopyrightRefusal(raw)
    expect(explained).toContain("reads as a real, recognisable person")
    expect(explained).toContain("credits have been returned")
    // The request id is the provider's, not the user's problem.
    expect(explained).not.toContain("0217891805143730000")
  })

  it("leaves every other failure alone", () => {
    expect(seedanceCopyrightRefusal("The specified asset asset-123 is not found")).toBeNull()
    expect(seedanceCopyrightRefusal("may contain real person")).toBeNull()
    expect(seedanceCopyrightRefusal("")).toBeNull()
  })
})
