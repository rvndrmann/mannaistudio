import { beforeEach, describe, expect, it, vi } from "vitest"
import { claimOnce } from "./track-once"

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  })
})

describe("claimOnce", () => {
  it("grants the first claim and refuses every repeat", () => {
    expect(claimOnce("k", "user-1")).toBe(true)
    expect(claimOnce("k", "user-1")).toBe(false)
    expect(claimOnce("k", "user-1")).toBe(false)
  })

  it("tracks ids independently", () => {
    expect(claimOnce("k", "user-1")).toBe(true)
    expect(claimOnce("k", "user-2")).toBe(true)
    expect(claimOnce("k", "user-1")).toBe(false)
  })

  it("keeps separate ledgers per key, so one event cannot suppress another", () => {
    expect(claimOnce("course-start", "u:a")).toBe(true)
    expect(claimOnce("director-opened", "u:a")).toBe(true)
  })

  it("refuses rather than fires when storage is unavailable", () => {
    // Over-firing is the failure that cost us; a missed event in a locked-down
    // browser is the cheaper side to err on.
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("blocked") },
        setItem: () => { throw new Error("blocked") },
      },
    })
    expect(claimOnce("k", "user-1")).toBe(false)
  })

  it("never fires during SSR", () => {
    vi.stubGlobal("window", undefined)
    expect(claimOnce("k", "user-1")).toBe(false)
  })

  it("caps the ledger so it cannot grow without bound", () => {
    for (let i = 0; i < 60; i += 1) claimOnce("k", `user-${i}`)
    expect(JSON.parse(store.get("k")!).length).toBeLessThanOrEqual(20)
  })
})
