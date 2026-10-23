import { describe, expect, it } from "vitest"
import {
  availabilityNote, buildCatalogue, capacityRefusal, defaultPackageFor, nextQueuePlace,
  packagePlacement, serviceAvailabilityNote, servicePlacement, slotsLeft, toAvailability,
  withAvailability, type AvailabilityRow,
} from "./managed-offers"

const service = {
  id: "11111111-1111-1111-1111-111111111111", key: "ugc", name: "UGC Ads",
  tagline: "", description: "", cta: "Start UGC Project", thumbnail_url: "", video_url: "",
  deliverables: [], styles: [], quote_only: false, is_published: true, position: 1,
}
const tier = (key: string, position: number, popular = false) => ({
  id: `aaaaaaaa-0000-0000-0000-00000000000${position}`, service_id: service.id, key,
  name: key, summary: "", video_count: 1, duration_seconds: 30, revisions: 2, price_inr: 1000 * position,
  includes: [], popular, is_published: true, position,
})
const row = (packageKey: string, patch: Partial<AvailabilityRow> = {}): AvailabilityRow => ({
  package_key: packageKey, slot_limit: 3, queue_limit: 2, slots_taken: 1, queue_taken: 0, queue_waiting: 0,
  placement: "slot", ...patch,
})

const base = buildCatalogue([service], [tier("starter", 1), tier("pack", 2, true)])

describe("package capacity, as the page reads it", () => {
  it("carries the limits off the row, null being unlimited", () => {
    const limited = buildCatalogue([service], [{ ...tier("starter", 1), slot_limit: 2, queue_limit: null }])
    expect(limited[0].packages[0]).toMatchObject({ slotLimit: 2, queueLimit: null, availability: null })
    expect(base[0].packages[0]).toMatchObject({ slotLimit: null, queueLimit: null })
  })

  it("treats a package with no counts as open", () => {
    expect(packagePlacement(base[0].packages[0])).toBe("slot")
    expect(servicePlacement(base[0])).toBe("slot")
    expect(serviceAvailabilityNote(base[0])).toBe("")
  })

  it("drops a row whose placement it does not recognise rather than guessing", () => {
    expect(toAvailability(row("starter", { placement: "maybe" }))).toBeNull()
  })

  it("attaches counts to the package they belong to and nowhere else", () => {
    const counted = withAvailability(base, [row("pack", { placement: "queue", slots_taken: 3 })])
    expect(counted[0].packages.find((option) => option.key === "pack")?.availability?.placement).toBe("queue")
    expect(counted[0].packages.find((option) => option.key === "starter")?.availability).toBeNull()
  })

  it("answers for the gig with its best tier", () => {
    const oneQueued = withAvailability(base, [row("pack", { placement: "queue" })])
    expect(servicePlacement(oneQueued[0])).toBe("slot")
    const bothQueued = withAvailability(base, [row("pack", { placement: "queue" }), row("starter", { placement: "sold_out" })])
    expect(servicePlacement(bothQueued[0])).toBe("queue")
    expect(serviceAvailabilityNote(bothQueued[0])).toBe("Slots full — join the queue")
    const gone = withAvailability(base, [row("pack", { placement: "sold_out" }), row("starter", { placement: "sold_out" })])
    expect(servicePlacement(gone[0])).toBe("sold_out")
    expect(serviceAvailabilityNote(gone[0])).toBe("Sold out")
  })

  it("only counts slots left on a gig when every open tier is limited", () => {
    const mixed = withAvailability(base, [row("pack", { slot_limit: 3, slots_taken: 1 })])
    expect(serviceAvailabilityNote(mixed[0])).toBe("")
    const limited = withAvailability(base, [row("pack", { slots_taken: 1 }), row("starter", { slots_taken: 2 })])
    expect(serviceAvailabilityNote(limited[0])).toBe("3 slots left")
  })

  it("describes one tier in a line", () => {
    expect(availabilityNote(null)).toBe("")
    expect(availabilityNote(toAvailability(row("x", { slots_taken: 2 })))).toBe("1 slot left")
    expect(availabilityNote(toAvailability(row("x", { slot_limit: null })))).toBe("")
    expect(availabilityNote(toAvailability(row("x", { placement: "queue", queue_taken: 1 })))).toBe("Slots full — 1 queue place left")
    expect(availabilityNote(toAvailability(row("x", { placement: "queue", queue_limit: null })))).toBe("Slots full — join the queue")
    expect(availabilityNote(toAvailability(row("x", { placement: "sold_out" })))).toBe("Sold out")
  })

  it("never reports negative slots, even if a limit is lowered under the running count", () => {
    expect(slotsLeft(toAvailability(row("x", { slot_limit: 1, slots_taken: 4 })))).toBe(0)
    expect(slotsLeft(null)).toBeNull()
  })

  it("puts a new queue booking behind everyone already waiting or paying", () => {
    expect(nextQueuePlace(toAvailability(row("x", { queue_taken: 2 })))).toBe(3)
    expect(nextQueuePlace(null)).toBe(1)
  })

  it("opens a brief on a tier that can still be bought", () => {
    const soldOutPopular = withAvailability(base, [row("pack", { placement: "sold_out" })])
    expect(defaultPackageFor(soldOutPopular[0])?.key).toBe("starter")
    expect(defaultPackageFor(base[0])?.key).toBe("pack")
  })
})

describe("capacityRefusal", () => {
  it("recognises the two refusals the database raises", () => {
    expect(capacityRefusal({ message: "managed_slots_full" })?.code).toBe("slots_full")
    expect(capacityRefusal(new Error("managed_sold_out"))?.code).toBe("sold_out")
  })

  it("leaves every other error alone", () => {
    expect(capacityRefusal({ message: "Managed projects can only be opened by the server" })).toBeNull()
    expect(capacityRefusal(null)).toBeNull()
  })
})
