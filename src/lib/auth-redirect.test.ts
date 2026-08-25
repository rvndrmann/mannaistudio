import { describe, expect, it } from "vitest"
import { isSafeNextPath, safeNextPath } from "./auth-redirect"

describe("safeNextPath", () => {
  it("returns a shared link's own path, which is the point of the parameter", () => {
    expect(safeNextPath("/courses")).toBe("/courses")
    expect(safeNextPath("/courses/intro-to-ai-video")).toBe("/courses/intro-to-ai-video")
    expect(safeNextPath("/courses?tab=free#lesson-2")).toBe("/courses?tab=free#lesson-2")
  })

  it.each([
    ["https://evil.test/steal", "an absolute URL"],
    ["//evil.test/steal", "a protocol-relative URL"],
    ["/\\evil.test/steal", "a backslash-smuggled authority"],
    ["/path\\to", "any backslash at all"],
    ["javascript:alert(1)", "a scheme that is not a path"],
    ["courses", "a relative path with no leading slash"],
    ["", "an empty string"],
  ])("refuses %s (%s)", (value) => {
    expect(safeNextPath(value)).toBe("/")
  })

  it("refuses a path carrying characters a browser strips before parsing", () => {
    // The string checked would not be the string followed.
    expect(safeNextPath("/\tjavascript:alert(1)")).toBe("/")
    expect(safeNextPath("/\nevil")).toBe("/")
    expect(safeNextPath("/\u0000evil")).toBe("/")
    expect(safeNextPath("/\u007Fevil")).toBe("/")
  })

  it("refuses anything that is not a string", () => {
    for (const value of [null, undefined, 42, {}, ["/courses"]]) {
      expect(safeNextPath(value)).toBe("/")
      expect(isSafeNextPath(value)).toBe(false)
    }
  })

  it("does not send the user back to the sign-in they just completed", () => {
    expect(safeNextPath("/login")).toBe("/")
    expect(safeNextPath("/auth/callback")).toBe("/")
    expect(safeNextPath("/auth/auth-code-error")).toBe("/")
  })

  it("does not mistake a path that merely starts with those letters for the sign-in", () => {
    expect(safeNextPath("/logins-explained")).toBe("/logins-explained")
    expect(safeNextPath("/authors/rao")).toBe("/authors/rao")
  })

  it("takes the caller's fallback when one is given", () => {
    expect(safeNextPath("//evil.test", "/studio")).toBe("/studio")
    expect(safeNextPath("/login", "/studio")).toBe("/studio")
  })
})
