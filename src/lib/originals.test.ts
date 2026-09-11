import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_EPISODE_PRICE,
  ORIGINALS_CREDIT_PACKAGES,
  UNLOCK_WINDOW_DAYS,
  unlockTimeRemaining,
} from "./originals"

describe("the viewer credit ladder", () => {
  it("starts at a pack someone will actually try", () => {
    // ₹200 was the floor, which is twenty episodes bought before a viewer has
    // decided they like the show. The ladder now opens at one episode.
    expect(Object.keys(ORIGINALS_CREDIT_PACKAGES)).toEqual(["10", "50", "200", "500"])
    expect(ORIGINALS_CREDIT_PACKAGES["1000"]).toBeUndefined()
  })

  it("holds one credit to one rupee across every pack", () => {
    // The whole platform quotes credits as rupees. A pack that broke the rate
    // would make two prices for the same thing depending on where you bought it.
    for (const pack of Object.values(ORIGINALS_CREDIT_PACKAGES)) {
      expect(pack.priceInr).toBe(pack.credits)
    }
  })

  it("buys the number of episodes each pack advertises", () => {
    for (const pack of Object.values(ORIGINALS_CREDIT_PACKAGES)) {
      expect(Math.floor(pack.credits / DEFAULT_EPISODE_PRICE)).toBe(pack.episodes)
    }
  })
})

describe("unlockTimeRemaining", () => {
  const at = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }
  afterEach(() => vi.useRealTimers())

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

  it("says nothing while the window is comfortable", () => {
    // A countdown printed on day one reads as a threat, not a service.
    at("2026-09-11T00:00:00Z")
    expect(unlockTimeRemaining(inDays(59))).toBeNull()
    expect(unlockTimeRemaining(inDays(15))).toBeNull()
  })

  it("warns once the window is nearly up", () => {
    at("2026-09-11T00:00:00Z")
    expect(unlockTimeRemaining(inDays(14))).toBe("14 days left")
    expect(unlockTimeRemaining(inDays(3))).toBe("3 days left")
  })

  it("names the last day rather than counting it", () => {
    at("2026-09-11T00:00:00Z")
    expect(unlockTimeRemaining(inDays(0.5))).toBe("Last day")
  })

  it("reports a lapsed rental as expired, not as time remaining", () => {
    // Rounding a negative interval up gave "0 days left", which reads as though
    // the episode still plays.
    at("2026-09-11T00:00:00Z")
    expect(unlockTimeRemaining(inDays(-1))).toBe("Expired")
  })

  it("treats a null expiry as permanent, which is what legacy unlocks are", () => {
    // Rows written before the rental window carry no expiry and were sold as
    // "yours to keep forever". They must never render a countdown.
    expect(unlockTimeRemaining(null)).toBeNull()
  })

  it("keeps the advertised window and the code's window the same number", () => {
    expect(UNLOCK_WINDOW_DAYS).toBe(60)
  })
})
