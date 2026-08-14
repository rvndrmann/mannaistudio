import { describe, expect, it } from "vitest"
import { isVideoReferencePath } from "./media-reference"

/**
 * The one check that decides whether an uploaded or attached file belongs in
 * the composition strip or the motion reference strip — on both sides. A clip
 * routed into the image list was registered with the provider as an image and
 * failed generation on "Unsupported media format", whether it got there from
 * the agent attaching a continuity clip or from a user dragging their own
 * footage onto the wrong uploader.
 */

describe("isVideoReferencePath", () => {
  it("recognises the video formats this workspace stores", () => {
    for (const ext of ["mp4", "mov", "webm", "m4v", "avi", "mkv"]) {
      expect(isVideoReferencePath(`user/project/shot-reference-abc.${ext}`)).toBe(true)
    }
  })

  it("leaves an image path alone", () => {
    expect(isVideoReferencePath("user/project/shot-reference-abc.png")).toBe(false)
    expect(isVideoReferencePath("user/project/entities/gpt-image-2-xyz.jpg")).toBe(false)
  })

  it("is not fooled by a query string or fragment after the extension", () => {
    expect(isVideoReferencePath("user/project/clip.mp4?token=abc")).toBe(true)
    expect(isVideoReferencePath("user/project/clip.mp4#t=2")).toBe(true)
  })

  it("does not match a filename that merely contains a video word", () => {
    expect(isVideoReferencePath("user/project/movement-reference.png")).toBe(false)
  })
})
