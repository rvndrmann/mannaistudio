import { describe, expect, it } from "vitest"
import {
  buildCatalogue, cheapestPackage, defaultPackageFor, offerPackageName,
  offerServiceName, packageFromCatalogue, parseOfferSnapshot, serviceFromCatalogue, snapshotFor,
} from "./managed-offers"

const services = [
  {
    id: "11111111-1111-1111-1111-111111111111", key: "ugc", name: "UGC Ads",
    tagline: "Creator-style ads", description: "", cta: "Start UGC Project",
    thumbnail_url: "https://cdn.test/ugc.jpg", video_url: "https://cdn.test/ugc.mp4",
    deliverables: ["15-second UGC ad"], styles: ["Problem → Solution"],
    quote_only: false, is_published: true, position: 1,
  },
  {
    id: "22222222-2222-2222-2222-222222222222", key: "micro_drama", name: "Branded Micro-Drama",
    tagline: "", description: "", cta: "Request Proposal",
    thumbnail_url: "", video_url: "", deliverables: [], styles: [],
    quote_only: true, is_published: true, position: 2,
  },
]

const packages = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001", service_id: services[0].id, key: "ugc_pack",
    name: "UGC Ad Pack", summary: "3 × 30-second videos", video_count: 3, duration_seconds: 30,
    revisions: 2, price_inr: 19_999, includes: [], popular: true, is_published: true, position: 2,
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002", service_id: services[0].id, key: "ugc_starter",
    name: "UGC Starter", summary: "1 × 30-second video", video_count: 1, duration_seconds: 30,
    revisions: 2, price_inr: 7_999, includes: [], popular: false, is_published: true, position: 1,
  },
]

const catalogue = buildCatalogue(services, packages)

describe("buildCatalogue", () => {
  it("nests packages under the service that owns them", () => {
    expect(catalogue).toHaveLength(2)
    expect(catalogue[0].key).toBe("ugc")
    expect(catalogue[0].packages.map((option) => option.key)).toEqual(["ugc_starter", "ugc_pack"])
    expect(catalogue[1].packages).toEqual([])
  })

  it("orders by position, not by the order rows arrived in", () => {
    // ugc_pack is listed first in the input but sits at position 2.
    expect(catalogue[0].packages[0].key).toBe("ugc_starter")
  })

  it("carries the gig's own media through", () => {
    expect(catalogue[0].thumbnailUrl).toBe("https://cdn.test/ugc.jpg")
    expect(catalogue[0].videoUrl).toBe("https://cdn.test/ugc.mp4")
  })

  it("survives nulls where a column was never filled in", () => {
    const sparse = buildCatalogue(
      [{ ...services[0], tagline: null, deliverables: null, styles: null, quote_only: null, is_published: null, position: null, cta: null, thumbnail_url: null, video_url: null, description: null }],
      [],
    )
    expect(sparse[0].tagline).toBe("")
    expect(sparse[0].styles).toEqual([])
    expect(sparse[0].cta).toBe("Start Project")
  })
})

describe("packageFromCatalogue", () => {
  it("prices from the catalogue", () => {
    expect(packageFromCatalogue(catalogue, "ugc", "ugc_pack")?.option.priceInr).toBe(19_999)
  })

  it("refuses an unknown package rather than falling back to one", () => {
    // A fallback would let a request naming a package that is not on sale be
    // quietly priced as the cheapest tier.
    expect(packageFromCatalogue(catalogue, "ugc", "ugc_free")).toBeNull()
    expect(packageFromCatalogue(catalogue, "ugc", "")).toBeNull()
    expect(packageFromCatalogue(catalogue, "nope", "ugc_pack")).toBeNull()
  })

  it("does not price a package against the wrong service", () => {
    expect(packageFromCatalogue(catalogue, "micro_drama", "ugc_pack")).toBeNull()
  })
})

describe("picking a tier", () => {
  it("defaults to the popular one", () => {
    expect(defaultPackageFor(serviceFromCatalogue(catalogue, "ugc"))?.key).toBe("ugc_pack")
  })

  it("falls back to the first when none is marked popular", () => {
    const plain = buildCatalogue(services, packages.map((option) => ({ ...option, popular: false })))
    expect(defaultPackageFor(plain[0])?.key).toBe("ugc_starter")
  })

  it("has nothing to pick for a quote-only gig", () => {
    expect(defaultPackageFor(serviceFromCatalogue(catalogue, "micro_drama"))).toBeNull()
    expect(cheapestPackage(catalogue[1])).toBeNull()
  })

  it("takes the cheapest tier for the FROM price", () => {
    expect(cheapestPackage(catalogue[0])?.priceInr).toBe(7_999)
  })
})

describe("the offer snapshot", () => {
  const snapshot = snapshotFor(catalogue[0], catalogue[0].packages[1])

  it("records what was sold", () => {
    expect(snapshot).toEqual({
      serviceKey: "ugc",
      serviceName: "UGC Ads",
      packageKey: "ugc_pack",
      packageName: "UGC Ad Pack",
      packageSummary: "3 × 30-second videos",
    })
  })

  it("handles a quote-only order with no package", () => {
    const quote = snapshotFor(catalogue[1], null)
    expect(quote.serviceName).toBe("Branded Micro-Drama")
    expect(quote.packageKey).toBe("")
  })

  it("survives junk rather than throwing on an old row", () => {
    expect(parseOfferSnapshot(null)).toEqual({})
    expect(parseOfferSnapshot("nonsense")).toEqual({})
  })
})

describe("offerServiceName", () => {
  it("prefers what the client was actually shown when they paid", () => {
    // The gig has since been renamed; the order must not be relabelled.
    const renamed = buildCatalogue([{ ...services[0], name: "Creator Ads" }], [])
    expect(offerServiceName({ serviceName: "UGC Ads" }, "ugc", renamed)).toBe("UGC Ads")
  })

  it("falls back to the live catalogue for an order placed before snapshots", () => {
    expect(offerServiceName({}, "ugc", catalogue)).toBe("UGC Ads")
  })

  it("falls back to the key when the gig has been deleted entirely", () => {
    // Reads as a key, which is a better failure than "undefined".
    expect(offerServiceName({}, "retired_gig", catalogue)).toBe("retired_gig")
    expect(offerServiceName({}, "retired_gig")).toBe("retired_gig")
  })

  it("names the package from the snapshot", () => {
    expect(offerPackageName({ packageName: "UGC Ad Pack" }, "ugc_pack")).toBe("UGC Ad Pack")
    expect(offerPackageName({}, "ugc_pack")).toBe("ugc_pack")
  })
})
