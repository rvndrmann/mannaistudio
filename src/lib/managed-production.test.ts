import { describe, expect, it } from "vitest"
import {
  MANAGED_SERVICES, MANAGED_STATUSES, defaultPackageFor, formatTimecode,
  isManagedClientPath, managedDeliverablePrefix, managedUploadPrefix,
  needsClientAction, packageFor, serviceFor, statusIndex,
} from "./managed-production"

const PROJECT = "7f1b0d22-3a4c-4a1e-9f2b-0c9d8e7a6b5c"

describe("packageFor", () => {
  it("prices a package from the catalogue, not from the caller", () => {
    expect(packageFor("ugc", "ugc_pack")?.priceInr).toBe(19_999)
    expect(packageFor("ugc", "ugc_pack")?.videoCount).toBe(3)
  })

  it("refuses an unknown package rather than falling back to one", () => {
    // A fallback here would let a request naming a package that does not exist
    // be quietly priced as the cheapest one.
    expect(packageFor("ugc", "ugc_free")).toBeNull()
    expect(packageFor("ugc", "")).toBeNull()
    expect(packageFor("not_a_service", "ugc_pack")).toBeNull()
  })

  it("does not price a package against the wrong service", () => {
    expect(packageFor("cinematic", "ugc_pack")).toBeNull()
  })

  it("has no package for the quote-only service", () => {
    const microDrama = serviceFor("micro_drama")
    expect(microDrama?.quoteOnly).toBe(true)
    expect(microDrama?.packages).toHaveLength(0)
    expect(defaultPackageFor("micro_drama")).toBeNull()
  })
})

describe("the catalogue", () => {
  it("gives every priced package a positive price, duration and video count", () => {
    for (const service of MANAGED_SERVICES) {
      for (const option of service.packages) {
        expect(option.priceInr, `${service.key}/${option.key}`).toBeGreaterThan(0)
        expect(option.videoCount, `${service.key}/${option.key}`).toBeGreaterThan(0)
        expect(option.durationSeconds, `${service.key}/${option.key}`).toBeGreaterThan(0)
      }
    }
  })

  it("keeps package keys unique across the whole catalogue", () => {
    // packageFor is scoped by service, but a duplicate key across two services
    // would make an order's stored package_key ambiguous after the fact.
    const keys = MANAGED_SERVICES.flatMap((service) => service.packages.map((option) => option.key))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("marks at most one package per service as the popular one", () => {
    for (const service of MANAGED_SERVICES) {
      expect(service.packages.filter((option) => option.popular).length).toBeLessThanOrEqual(1)
    }
  })

  it("defaults to the popular package, or the first when none is marked", () => {
    expect(defaultPackageFor("ugc")?.key).toBe("ugc_pack")
    expect(defaultPackageFor("direct_response")?.key).toBe("dr_campaign")
  })
})

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
