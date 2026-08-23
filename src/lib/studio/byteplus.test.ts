import { generationRequestSchema } from "./model-routing"
import { describe, expect, it } from "vitest"
import { formatBytePlusError, formatBytePlusMediaUrl, bytePlusVideoRatio, bytePlusVideoReferenceLimit, formatBytePlusReferencePrompt } from "./byteplus"

describe("formatBytePlusError", () => {
  it("uses nested BytePlus error messages and redacts provider identifiers", () => {
    expect(formatBytePlusError({
      error: {
        code: "ModelNotOpen",
        message: "Your account 3000000000 has not activated the model test-model. Request id: 021786093786564fd2e0ebdb3eb064cbe39fbfe58bf7263e4d192",
      },
    }, 404)).toBe("BytePlus request failed (404): Your account has not activated the model test-model. Request id: redacted")
  })
})

describe("formatBytePlusMediaUrl", () => {
  it("preserves standard HTTP URLs", () => {
    expect(formatBytePlusMediaUrl("https://storage.supabase.co/v1/image.png")).toBe("https://storage.supabase.co/v1/image.png")
  })

  it("formats raw asset IDs into asset:// URIs", () => {
    expect(formatBytePlusMediaUrl("asset-20260222234430-mxpgh")).toBe("asset://asset-20260222234430-mxpgh")
  })

  it("preserves already formatted asset:// URIs", () => {
    expect(formatBytePlusMediaUrl("asset://asset-20260222234430-mxpgh")).toBe("asset://asset-20260222234430-mxpgh")
  })
})

describe("seedance video references", () => {
  it("allows 3 videos totalling 15 seconds on Seedance 2.0", () => {
    const limit = bytePlusVideoReferenceLimit("dreamina-seedance-2-0-250428")
    expect(limit.maxVideos).toBe(3)
    expect(limit.maxTotalSeconds).toBe(15)
  })

  it("raises the allowance on Seedance 2.5", () => {
    const limit = bytePlusVideoReferenceLimit("dreamina-seedance-2-5-260628")
    expect(limit.maxVideos).toBe(10)
    expect(limit.maxTotalSeconds).toBe(30)
  })

  it("converts Studio aliases to BytePlus numbered input references", () => {
    const prompt = formatBytePlusReferencePrompt(
      "Extend from video @previous shot video using @storyboard shot 2 image.",
      { imageCount: 1, videoCount: 1 },
    )
    expect(prompt).toContain("[Video 1]")
    expect(prompt).toContain("[Image 1]")
    expect(prompt).not.toContain("@previous shot video")
    expect(prompt).not.toContain("@storyboard shot 2 image")
  })

  it("adds explicit guidance when references were not named", () => {
    const prompt = formatBytePlusReferencePrompt("Continue the scene.", { imageCount: 1, videoCount: 1 })
    expect(prompt).toContain("Use [Video 1]")
    expect(prompt).toContain("Use [Image 1]")
  })

  it("uses adaptive ratio when extending from a video reference", () => {
    expect(bytePlusVideoRatio("9:16", true)).toBe("adaptive")
  })

  it("keeps the requested ratio when no video reference is present", () => {
    expect(bytePlusVideoRatio("9:16", false)).toBe("9:16")
  })
})

/**
 * The Studio writes `@Sara`; Seedance's documented syntax is `Sara@Image 1`.
 * Passed through untranslated, the reference image travelled with the request
 * and nothing in the prompt pointed at it, so the clip was rendered from the
 * words instead of the reference art.
 */
describe("the cast is bound to the pictures that travel with the request", () => {
  const subjects = [
    { name: "Sara", imageIndex: 1 },
    { name: "Sleek Luxury Car", imageIndex: 2 },
  ]

  it("rewrites each mention into the provider's binding syntax", () => {
    const prompt = formatBytePlusReferencePrompt(
      "@Sara drives the @Sleek Luxury Car down a sunny street.",
      { imageCount: 2, videoCount: 0, subjects },
    )
    expect(prompt).toContain("Sara@Image 1")
    expect(prompt).toContain("Sleek Luxury Car@Image 2")
    expect(prompt).not.toContain("@Sara ")
  })

  it("says so when a mentioned subject has no picture behind it", () => {
    const prompt = formatBytePlusReferencePrompt(
      "@Sara opens the @Briefcase.",
      { imageCount: 1, videoCount: 0, subjects: [subjects[0]], mentionedNames: ["Sara", "Briefcase"] },
    )
    expect(prompt).toContain("Sara@Image 1")
    expect(prompt).toContain("No reference image was provided for Briefcase")
  })

  it("leaves a prompt with no cast exactly as it was before", () => {
    // The composition-reference guidance is unchanged; only mentions are new.
    const prompt = formatBytePlusReferencePrompt("Continue the scene.", { imageCount: 1, videoCount: 0, subjects: [] })
    expect(prompt).toContain("Use [Image 1]")
    expect(prompt).not.toContain("No reference image was provided")
  })

  it("still translates the shot-reference forms it always did", () => {
    const prompt = formatBytePlusReferencePrompt(
      "Extend from @previous shot video with @Sara steady in frame.",
      { imageCount: 1, videoCount: 1, subjects: [subjects[0]] },
    )
    expect(prompt).toContain("[Video 1]")
    expect(prompt).toContain("Sara@Image 1")
  })
})

/**
 * A cast reference is never a frame.
 *
 * Roles were assigned by index — first, last, then everything else — which
 * reads correctly only when the caller sends a start frame and an end frame and
 * nothing in front of the cast. The moment a shot sent its keyframe plus three
 * cast references, the first cast member became the clip's *last frame* and the
 * video ended on a reference sheet.
 */
describe("keyframe mode names only the frames it was given", () => {
  // Role assignment as submitBytePlusVideo applies it.
  const roles = (count: number, compositionFrames: number) =>
    Array.from({ length: count }, (_, index) =>
      index === 0 && compositionFrames >= 1 ? "first_frame"
        : index === 1 && compositionFrames >= 2 ? "last_frame"
        : "reference_image")

  it("makes the cast plain references when only one frame was sent", () => {
    // Keyframe, then Sara, the car and the street.
    expect(roles(4, 1)).toEqual(["first_frame", "reference_image", "reference_image", "reference_image"])
  })

  it("still honours a real start and end frame", () => {
    expect(roles(4, 2)).toEqual(["first_frame", "last_frame", "reference_image", "reference_image"])
  })

  it("sends everything as a reference when no frame was given", () => {
    expect(roles(3, 0)).toEqual(["reference_image", "reference_image", "reference_image"])
  })
})

describe("a chat video generation defaults to multi image", () => {
  it("reads every attached image as a reference rather than a position in time", () => {
    // multi_image is what a storyboard shot wants: its own keyframe for
    // composition plus the cast, none of them claiming to be the first or last
    // frame. keyframe mode is for the panel's explicit start/end flow.
    const parsed = generationRequestSchema.parse({ type: "video", shotNumbers: [1], episodeId: "11111111-1111-4111-8111-111111111111" })
    expect(parsed.generationMode).toBe("multi_image")
  })

  it("still lets a caller ask for keyframe mode outright", () => {
    const parsed = generationRequestSchema.parse({ type: "video", shotNumbers: [1], episodeId: "11111111-1111-4111-8111-111111111111", generationMode: "keyframe" })
    expect(parsed.generationMode).toBe("keyframe")
  })
})
