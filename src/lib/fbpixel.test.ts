import { beforeEach, describe, expect, it, vi } from "vitest"
import { fbTrack } from "./fbpixel"

const fbq = vi.fn()
const gtag = vi.fn()

beforeEach(() => {
  fbq.mockReset()
  gtag.mockReset()
  vi.stubGlobal("window", { fbq, gtag })
})

describe("fbTrack", () => {
  it("sends Meta's own events on the standard channel", () => {
    for (const event of ["Purchase", "InitiateCheckout", "CompleteRegistration", "Lead", "Subscribe"]) {
      fbq.mockReset()
      fbTrack(event)
      expect(fbq.mock.calls[0][0], event).toBe("track")
    }
  })

  it("sends our own events as custom events", () => {
    // Sent via "track", Meta files these as unofficial and they cannot be relied
    // on for custom conversions or delivery optimisation — which is the only
    // reason they exist.
    for (const event of ["CourseStart", "DirectorOpened"]) {
      fbq.mockReset()
      fbTrack(event)
      expect(fbq.mock.calls[0][0], event).toBe("trackCustom")
    }
  })

  it("keeps PageView standard, since that is what the pixel counts as a page view", () => {
    fbTrack("PageView")
    expect(fbq.mock.calls[0][0]).toBe("track")
  })

  it("passes the event name and params through unchanged either way", () => {
    fbTrack("CourseStart", { content_ids: ["c1"] })
    expect(fbq.mock.calls[0]).toEqual(["trackCustom", "CourseStart", { content_ids: ["c1"] }])
  })

  it("maps to GA4 names regardless of which Meta channel was used", () => {
    fbTrack("CourseStart")
    fbTrack("Purchase")
    expect(gtag.mock.calls[0]).toEqual(["event", "course_start", undefined])
    expect(gtag.mock.calls[1]).toEqual(["event", "purchase", undefined])
  })

  it("passes an unmapped name to GA4 as-is", () => {
    fbTrack("SomethingNew")
    expect(gtag.mock.calls[0][1]).toBe("SomethingNew")
  })

  it("no-ops when neither tag has loaded", () => {
    vi.stubGlobal("window", {})
    expect(() => fbTrack("CourseStart")).not.toThrow()
  })

  it("never fires during SSR", () => {
    vi.stubGlobal("window", undefined)
    fbTrack("CourseStart")
    expect(fbq).not.toHaveBeenCalled()
  })
})
