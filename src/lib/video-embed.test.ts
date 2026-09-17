import { describe, expect, it } from "vitest"
import {
  embedThumbnailUrl, instagramEmbedUrl, instagramShortcode, isEmbeddedVideo,
  isVerticalVideo, videoEmbedUrl, youtubeVideoId,
} from "./video-embed"

const UPLOAD = "https://cytkucdnllicnmljixwd.supabase.co/storage/v1/object/public/videos/hire-us/1-a.mp4"

describe("instagramShortcode", () => {
  it("reads a reel, a post and an IGTV link", () => {
    expect(instagramShortcode("https://www.instagram.com/reel/Cx1_ab-YZ/")).toBe("Cx1_ab-YZ")
    expect(instagramShortcode("https://www.instagram.com/p/Cx1_ab-YZ/")).toBe("Cx1_ab-YZ")
    expect(instagramShortcode("https://www.instagram.com/tv/Cx1_ab-YZ/")).toBe("Cx1_ab-YZ")
  })

  // What the app's share sheet actually hands you.
  it("reads the profile-scoped form and ignores the tracking query", () => {
    expect(instagramShortcode("https://www.instagram.com/acme.studio/reel/Cx1_ab-YZ/?igsh=MWx5")).toBe("Cx1_ab-YZ")
  })

  it("reads the plural /reels/ path and a link with no www", () => {
    expect(instagramShortcode("https://instagram.com/reels/Cx1_ab-YZ")).toBe("Cx1_ab-YZ")
  })

  it("is null for a profile, an uploaded file and an empty string", () => {
    expect(instagramShortcode("https://www.instagram.com/acme.studio/")).toBeNull()
    expect(instagramShortcode(UPLOAD)).toBeNull()
    expect(instagramShortcode("")).toBeNull()
  })
})

describe("instagramEmbedUrl", () => {
  it("builds the embed page for a reel", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/reel/Cx1_ab-YZ/"))
      .toBe("https://www.instagram.com/p/Cx1_ab-YZ/embed")
  })

  it("is null for a YouTube link, which has its own player", () => {
    expect(instagramEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBeNull()
  })
})

describe("videoEmbedUrl", () => {
  it("prefers YouTube's player for a YouTube link", () => {
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube.com/embed/dQw4w9WgXcQ")
  })

  it("falls through to Instagram's for a reel", () => {
    expect(videoEmbedUrl("https://www.instagram.com/reel/Cx1_ab-YZ/")).toContain("instagram.com/p/Cx1_ab-YZ/embed")
  })

  // The whole point: an uploaded file must keep using the <video> element.
  it("is null for an uploaded file", () => {
    expect(videoEmbedUrl(UPLOAD)).toBeNull()
    expect(isEmbeddedVideo(UPLOAD)).toBe(false)
  })
})

describe("what a card can show before anything plays", () => {
  it("derives a still for YouTube", () => {
    expect(embedThumbnailUrl("https://youtu.be/dQw4w9WgXcQ")).toContain("dQw4w9WgXcQ")
  })

  // Instagram publishes none, so the card must fall back rather than render a
  // broken image: the gig's own thumbnail, or the placeholder.
  it("has none for Instagram", () => {
    expect(embedThumbnailUrl("https://www.instagram.com/reel/Cx1_ab-YZ/")).toBeNull()
  })
})

describe("isVerticalVideo", () => {
  it("treats Shorts and reels as vertical, and a normal video as not", () => {
    expect(isVerticalVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true)
    expect(isVerticalVideo("https://www.instagram.com/reel/Cx1_ab-YZ/")).toBe(true)
    expect(isVerticalVideo("https://youtu.be/dQw4w9WgXcQ")).toBe(false)
  })
})

describe("youtubeVideoId still works alongside Instagram", () => {
  it("reads watch, share and Shorts forms", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })
})
