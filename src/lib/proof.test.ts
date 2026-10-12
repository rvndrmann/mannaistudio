import { describe, expect, it } from "vitest"
import { courseDisplayTitle, courseDurationLabel, courseMetaLine } from "@/lib/course-catalog"
import { formatProofAmount, proofCategoryLabel, proofPoster, publishBlocker, toProofItem, toProofPageSettings, toProofRow } from "@/lib/proof"
import { moveBefore } from "@/components/admin/ProofManager"
import { isEmbeddedVideo, videoEmbedUrl } from "@/lib/video-embed"

describe("publishBlocker", () => {
  it("refuses without consent", () => {
    expect(publishBlocker({ consentConfirmed: false, video: "", posterImage: "" })).toMatch(/agreed/)
  })
  it("refuses a video with no poster", () => {
    expect(publishBlocker({ consentConfirmed: true, video: "https://x/a.mp4", posterImage: "" })).toMatch(/poster/)
  })
  it("allows consented items with a poster, or with no video", () => {
    expect(publishBlocker({ consentConfirmed: true, video: "https://x/a.mp4", posterImage: "p.webp" })).toBeNull()
    expect(publishBlocker({ consentConfirmed: true, video: "", posterImage: "" })).toBeNull()
  })
})

describe("toProofItem / toProofRow", () => {
  const row = {
    id: "1", type: "sale_proof", title: " Brand film ", category: "film", person_name: "A", person_role: "B", avatar_image: "",
    quote: "q", screenshots: [{ url: "u", thumb: "t" }, "plain"], video_url: "", thumbnail: "", amount: "45000", currency: "INR",
    proof_date: "2026-09-01", consent_confirmed: true, is_featured: true, published: true, position: 3, created_at: "c", updated_at: "u",
  }
  it("maps the showcase columns onto the proof names", () => {
    const item = toProofItem(row)
    expect(item).toMatchObject({ type: "sale_proof", featured: true, sortOrder: 3, amount: 45000, date: "2026-09-01" })
    expect(item.screenshots).toEqual([{ url: "u", thumb: "t" }, { url: "plain", thumb: "plain" }])
  })
  it("round-trips, trimming text and dropping the currency of an empty amount", () => {
    const back = toProofRow({ ...toProofItem(row), amount: null })
    expect(back).toMatchObject({ title: "Brand film", is_featured: true, position: 3, amount: null, currency: null })
  })
  it("treats an unknown type as portfolio and a missing row as a draft", () => {
    expect(toProofItem({ id: "2", type: "nonsense" })).toMatchObject({ type: "portfolio", published: false, consentConfirmed: false })
  })
})

describe("proof display helpers", () => {
  it("labels categories, including ones saved before the proof list existed", () => {
    expect(proofCategoryLabel("ugc")).toBe("UGC Ad")
    expect(proofCategoryLabel("ai_film")).toBe("Film")
    expect(proofCategoryLabel("whatever")).toBe("Other")
  })
  it("formats amounts per currency and nothing for no amount", () => {
    expect(formatProofAmount(45000, "INR")).toBe("₹45,000")
    expect(formatProofAmount(1200, "USD")).toBe("$1,200")
    expect(formatProofAmount(null, "INR")).toBe("")
  })
  it("falls back from poster to the embed's own still to a screenshot", () => {
    expect(proofPoster({ posterImage: "p", video: "", screenshots: [] })).toBe("p")
    expect(proofPoster({ posterImage: "", video: "https://youtu.be/abcdefghijk", screenshots: [] })).toContain("abcdefghijk")
    expect(proofPoster({ posterImage: "", video: "", screenshots: [{ url: "u", thumb: "t" }] })).toBe("t")
  })
  it("hides settings that are empty or malformed", () => {
    expect(toProofPageSettings(null)).toMatchObject({ costExample: "", showAnnualPlan: false, annualPrice: null })
    expect(toProofPageSettings({ api_guide_url: "javascript:alert(1)", annual_price: 0 })).toMatchObject({ apiGuideUrl: "", annualPrice: null })
    expect(toProofPageSettings({ api_guide_url: "/blog/keys", annual_price: 7999, show_annual_plan: true })).toMatchObject({ apiGuideUrl: "/blog/keys", annualPrice: 7999, showAnnualPlan: true })
  })
})

describe("moveBefore", () => {
  const list = ["a", "b", "c", "d"].map((id) => ({ id }))
  const ids = (items: Array<{ id: string }>) => items.map((item) => item.id).join("")
  it("drops a row dragged down just after its target", () => expect(ids(moveBefore(list, "a", "c"))).toBe("bcad"))
  it("drops a row dragged up just before its target", () => expect(ids(moveBefore(list, "d", "b"))).toBe("adbc"))
  it("leaves the list alone for unknown ids or a drop on itself", () => {
    expect(moveBefore(list, "a", "a")).toBe(list)
    expect(moveBefore(list, "x", "b")).toBe(list)
  })
})

describe("course catalogue", () => {
  it("never prints a zero duration", () => {
    for (const zero of ["0 Hours", "0", "0h", " 0 min ", ""]) expect(courseDurationLabel(zero)).toBe("")
    expect(courseDurationLabel("12 min")).toBe("12 min")
    expect(courseDurationLabel("10 Hours")).toBe("10 Hours")
  })
  it("leaves unknown parts out of the meta line", () => {
    expect(courseMetaLine({ level: "Beginner", chapters: 6, duration: "0 Hours" })).toBe("Beginner · 6 lessons")
    expect(courseMetaLine({ level: "Beginner", chapters: 1, duration: "12 min" })).toBe("Beginner · 1 lesson · 12 min")
  })
  it("calms a title typed in capitals and leaves the rest alone", () => {
    expect(courseDisplayTitle("AI DRAMA SHOW MINI COURSE")).toBe("AI Drama Show Mini Course")
    expect(courseDisplayTitle("AI Filmmaking - 1 hour Crash Course")).toBe("AI Filmmaking - 1 hour Crash Course")
  })
})

describe("vimeo embeds", () => {
  it("recognises a Vimeo link as an embed", () => {
    expect(isEmbeddedVideo("https://vimeo.com/123456789")).toBe(true)
    expect(videoEmbedUrl("https://vimeo.com/123456789", { autoplay: true, muted: true })).toContain("player.vimeo.com/video/123456789")
  })
  it("still treats an uploaded file as a file", () => expect(isEmbeddedVideo("https://x.supabase.co/a/b.mp4")).toBe(false))
})
