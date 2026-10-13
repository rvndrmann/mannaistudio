import { afterEach, describe, expect, it, vi } from "vitest"
import { runInBackground, setBackgroundKeepAlive } from "./background-work"

afterEach(() => { setBackgroundKeepAlive(null); vi.restoreAllMocks() })

describe("runInBackground", () => {
  it("hands the work to the host's keep-alive when one is registered", async () => {
    const kept: Promise<unknown>[] = []
    setBackgroundKeepAlive((work) => { kept.push(work) })
    let finished = false
    runInBackground(Promise.resolve().then(() => { finished = true }))
    expect(kept).toHaveLength(1)
    await kept[0]
    expect(finished).toBe(true)
  })

  it("still runs the work where there is no host to ask", async () => {
    let finished = false
    runInBackground(Promise.resolve().then(() => { finished = true }))
    await Promise.resolve(); await Promise.resolve()
    expect(finished).toBe(true)
  })

  it("never lets a failed job become an unhandled rejection, or a refusing host stop the work", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const kept: Promise<unknown>[] = []
    setBackgroundKeepAlive((work) => { kept.push(work) })
    runInBackground(Promise.reject(new Error("provider down")))
    await expect(kept[0]).resolves.toBeUndefined()
    setBackgroundKeepAlive(() => { throw new Error("called outside a request") })
    expect(() => runInBackground(Promise.resolve())).not.toThrow()
  })
})
