import { describe, expect, it } from "vitest"
import {
  MANAGED_STATUSES, formatTimecode, isManagedClientPath,
  managedDeliverablePrefix, managedUploadPrefix, needsClientAction, statusIndex,
} from "./managed-production"

const PROJECT = "7f1b0d22-3a4c-4a1e-9f2b-0c9d8e7a6b5c"

describe("the pipeline", () => {
  it("orders the stages as the timeline draws them", () => {
    expect(statusIndex("brief_received")).toBe(0)
    expect(statusIndex("completed")).toBe(MANAGED_STATUSES.length - 1)
    expect(statusIndex("production")).toBeLessThan(statusIndex("first_cut"))
  })

  it("reports an unknown or cancelled status as off the timeline", () => {
    expect(statusIndex("cancelled")).toBe(-1)
    expect(statusIndex("nonsense")).toBe(-1)
  })

  it("treats only a cut awaiting review as the client's move", () => {
    expect(needsClientAction("ready_for_review")).toBe(true)
    expect(needsClientAction("in_production")).toBe(false)
    expect(needsClientAction("revision_requested")).toBe(false)
    expect(needsClientAction("approved")).toBe(false)
  })
})

describe("client storage paths", () => {
  it("puts uploads and deliverables under the project's own folder", () => {
    expect(managedUploadPrefix(PROJECT)).toBe(`managed/${PROJECT}/uploads`)
    expect(managedDeliverablePrefix(PROJECT)).toBe(`managed/${PROJECT}/deliverables`)
  })

  it("accepts only paths inside this project", () => {
    expect(isManagedClientPath(PROJECT, `managed/${PROJECT}/uploads/a.png`)).toBe(true)
    expect(isManagedClientPath(PROJECT, `managed/${PROJECT}/deliverables/v1.mp4`)).toBe(true)
  })

  it("refuses another project's folder, an internal studio path, and traversal", () => {
    // The three ways a path could reach a file the client was never sent.
    expect(isManagedClientPath(PROJECT, "managed/00000000-0000-0000-0000-000000000000/uploads/a.png")).toBe(false)
    expect(isManagedClientPath(PROJECT, `2c8f/${PROJECT}/shot-07.mp4`)).toBe(false)
    expect(isManagedClientPath(PROJECT, `managed/${PROJECT}/../other/a.png`)).toBe(false)
  })
})

describe("formatTimecode", () => {
  it("reads as a revision note's timestamp", () => {
    expect(formatTimecode(8)).toBe("00:08")
    expect(formatTimecode(19.7)).toBe("00:19")
    expect(formatTimecode(67)).toBe("01:07")
  })

  it("never shows a negative or unknown position", () => {
    expect(formatTimecode(-4)).toBe("00:00")
    expect(formatTimecode(Number.NaN)).toBe("00:00")
  })
})
