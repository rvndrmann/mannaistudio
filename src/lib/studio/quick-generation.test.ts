import { describe, expect, it } from "vitest"
import {
  composeQuickPrompt,
  extensionForContentType,
  foreignReferences,
  isDirectReference,
  quickStoragePath,
  toHistoryItem,
} from "./quick-generation"

const USER = "11111111-1111-1111-1111-111111111111"

describe("where a standalone result is stored", () => {
  it("puts the owner first and a non-project segment second", () => {
    // The bucket's owner policy matches the first segment against the caller,
    // and its sharing policy resolves the second as a project id. A literal
    // that matches no project is what keeps these files owner-only.
    const path = quickStoragePath({ userId: USER, provider: "fal", kind: "image", extension: "png" })
    expect(path.startsWith(`${USER}/quick/`)).toBe(true)
    expect(path.endsWith(".png")).toBe(true)
  })

  it("never repeats a path", () => {
    const args = { userId: USER, provider: "fal", kind: "image" as const, extension: "png" }
    expect(quickStoragePath(args)).not.toBe(quickStoragePath(args))
  })

  it("refuses to let an extension smuggle path segments in", () => {
    const path = quickStoragePath({ userId: USER, provider: "fal", kind: "image", extension: "../../png" })
    expect(path.split("/")).toHaveLength(3)
    expect(path.endsWith(".png")).toBe(true)
  })
})

describe("naming the file for what came back", () => {
  it("reads the content type rather than assuming PNG", () => {
    expect(extensionForContentType("image/jpeg")).toBe("jpg")
    expect(extensionForContentType("image/webp")).toBe("webp")
    expect(extensionForContentType("video/mp4")).toBe("mp4")
  })

  it("falls back to png for anything unrecognised", () => {
    expect(extensionForContentType("application/octet-stream")).toBe("png")
  })
})

describe("the prompt that reaches the model", () => {
  it("leaves the user's words first and unedited", () => {
    const composed = composeQuickPrompt("  a red door in the rain  ", "16:9")
    expect(composed.startsWith("a red door in the rain")).toBe(true)
  })

  it("states the composition, which several models ignore as a bare parameter", () => {
    expect(composeQuickPrompt("a red door", "21:9")).toContain("Required composition: 21:9.")
  })

  it("adds nothing at all when no ratio is asked for", () => {
    expect(composeQuickPrompt("a red door", "")).toBe("a red door")
  })
})

describe("references that do not belong to the caller", () => {
  it("catches another account's storage path", () => {
    const other = "22222222-2222-2222-2222-222222222222/quick/ref.png"
    expect(foreignReferences(USER, [`${USER}/quick/mine.png`, other])).toEqual([other])
  })

  it("lets URLs and provider asset ids through, which are not ours to own", () => {
    const allowed = ["https://example.com/a.png", "asset://asset-abc", "asset-abc123"]
    expect(foreignReferences(USER, allowed)).toEqual([])
    for (const value of allowed) expect(isDirectReference(value)).toBe(true)
  })

  it("does not treat a path that merely starts with the id as owned", () => {
    // `{user}-other/…` shares a prefix with `{user}/…` but is a different
    // folder, so the check has to include the separator.
    expect(foreignReferences(USER, [`${USER}-other/quick/x.png`])).toHaveLength(1)
  })
})

describe("a history row as the page reads it", () => {
  it("reports what the charge actually came to after a refund", () => {
    // A failed generation that was refunded costs nothing. Reporting the amount
    // it briefly took makes the history disagree with the balance, which reads
    // as having been charged twice.
    const item = toHistoryItem({ id: "a", type: "image", credits_used: 12, credits_refunded: 12 })
    expect(item.creditsCharged).toBe(0)
  })

  it("reports a charge that stuck", () => {
    expect(toHistoryItem({ id: "a", type: "image", credits_used: 12, credits_refunded: 0 }).creditsCharged).toBe(12)
  })

  it("never reports a negative charge", () => {
    expect(toHistoryItem({ id: "a", type: "image", credits_used: 0, credits_refunded: 5 }).creditsCharged).toBe(0)
  })

  it("defaults a missing type to image rather than inventing one", () => {
    expect(toHistoryItem({ id: "a" }).type).toBe("image")
    expect(toHistoryItem({ id: "a", type: "video" }).type).toBe("video")
  })

  it("turns an empty result url into no result at all", () => {
    // An empty string is falsy in the template but truthy as a path, and a tile
    // handed one would sign nothing and render a broken frame for ever.
    expect(toHistoryItem({ id: "a", result_url: "" }).resultPath).toBeNull()
  })
})
