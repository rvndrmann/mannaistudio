import { z } from "zod"

/**
 * The catalogue, as it comes out of the database.
 *
 * It used to be a constant in `managed-production.ts`, which made changing a
 * price a deploy. It lives in `managed_offer_services` / `managed_offer_packages`
 * now and is shaped like a Fiverr gig: the service is the card that sells, with
 * a thumbnail and a promo video, and its packages are the price tiers under it.
 *
 * The one rule that did not move: a price is read from here by the server and
 * never taken from the browser. `packageFromCatalogue` is what checkout prices
 * an order with.
 */

export const packagePlacementSchema = z.enum(["slot", "queue", "sold_out"])
export type PackagePlacement = z.infer<typeof packagePlacementSchema>

export const packageAvailabilitySchema = z.object({
  slotLimit: z.number().int().nullable(),
  queueLimit: z.number().int().nullable(),
  slotsTaken: z.number().int(),
  queueTaken: z.number().int(),
  queueWaiting: z.number().int(),
  placement: packagePlacementSchema,
  // Slots held by other buyers' unpaid checkouts, and when the first of those
  // holds lapses (ISO). A hold is 15 minutes; an unpaid one gives the slot back.
  slotsHeld: z.number().int().default(0),
  heldUntil: z.string().nullable().default(null),
})
export type PackageAvailability = z.infer<typeof packageAvailabilitySchema>

export const offerPackageSchema = z.object({
  // Not `.uuid()`: these are our own primary keys coming back out of our own
  // database, so version-checking them buys nothing — and a row that failed the
  // check would throw out of `buildCatalogue` and take the whole page with it.
  // Anywhere an id is acted on, Postgres does the real typing.
  id: z.string().min(1),
  key: z.string(),
  name: z.string(),
  summary: z.string().default(""),
  videoCount: z.number().int().positive(),
  durationSeconds: z.number().int().positive(),
  revisions: z.number().int().nonnegative(),
  priceInr: z.number().int().nonnegative(),
  includes: z.array(z.string()).default([]),
  popular: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  position: z.number().int().default(0),
  // Capacity, set in Admin → Offers. Null is unlimited. See
  // 20261023120000_managed_package_capacity.sql for what occupies a slot.
  slotLimit: z.number().int().nonnegative().nullable().default(null),
  queueLimit: z.number().int().nonnegative().nullable().default(null),
  // Live counts, attached by the offers route; absent means unlimited or not
  // read. Display only — checkout counts again under a lock.
  availability: packageAvailabilitySchema.nullable().default(null),
})

export const offerServiceSchema = z.object({
  id: z.string().min(1),
  key: z.string(),
  name: z.string(),
  tagline: z.string().default(""),
  description: z.string().default(""),
  cta: z.string().default("Start Project"),
  thumbnailUrl: z.string().default(""),
  videoUrl: z.string().default(""),
  deliverables: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  quoteOnly: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  position: z.number().int().default(0),
  packages: z.array(offerPackageSchema).default([]),
})

export type OfferPackage = z.infer<typeof offerPackageSchema>
export type OfferService = z.infer<typeof offerServiceSchema>

/** Row shapes as PostgREST returns them, before they are given camel-case names. */
type ServiceRow = {
  id: string
  key: string
  name: string
  tagline: string | null
  description: string | null
  cta: string | null
  thumbnail_url: string | null
  video_url: string | null
  deliverables: string[] | null
  styles: string[] | null
  quote_only: boolean | null
  is_published: boolean | null
  position: number | null
}

type PackageRow = {
  id: string
  service_id: string
  key: string
  name: string
  summary: string | null
  video_count: number | null
  duration_seconds: number | null
  revisions: number | null
  price_inr: number | null
  includes: string[] | null
  popular: boolean | null
  is_published: boolean | null
  position: number | null
  slot_limit?: number | null
  queue_limit?: number | null
}

export function toOfferPackage(row: PackageRow): OfferPackage {
  return offerPackageSchema.parse({
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary ?? "",
    videoCount: row.video_count ?? 1,
    durationSeconds: row.duration_seconds ?? 30,
    revisions: row.revisions ?? 2,
    priceInr: row.price_inr ?? 0,
    includes: row.includes ?? [],
    popular: row.popular ?? false,
    isPublished: row.is_published ?? true,
    position: row.position ?? 0,
    slotLimit: row.slot_limit ?? null,
    queueLimit: row.queue_limit ?? null,
  })
}

/**
 * Joins the two tables into the shape every screen wants.
 *
 * Ordering is by `position` then name so a catalogue whose positions were never
 * set still comes out in a stable order rather than whatever the planner
 * happened to return.
 */
export function buildCatalogue(services: ServiceRow[], packages: PackageRow[]): OfferService[] {
  const byService = new Map<string, PackageRow[]>()
  for (const row of packages) {
    byService.set(row.service_id, [...(byService.get(row.service_id) ?? []), row])
  }
  const order = (a: { position: number | null; name: string }, b: { position: number | null; name: string }) =>
    (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)

  return [...services].sort(order).map((row) =>
    offerServiceSchema.parse({
      id: row.id,
      key: row.key,
      name: row.name,
      tagline: row.tagline ?? "",
      description: row.description ?? "",
      cta: row.cta || "Start Project",
      thumbnailUrl: row.thumbnail_url ?? "",
      videoUrl: row.video_url ?? "",
      deliverables: row.deliverables ?? [],
      styles: row.styles ?? [],
      quoteOnly: row.quote_only ?? false,
      isPublished: row.is_published ?? true,
      position: row.position ?? 0,
      packages: (byService.get(row.id) ?? []).sort(order).map(toOfferPackage),
    }),
  )
}

/**
 * The catalogue with the drafts taken out.
 *
 * RLS already hides an unpublished gig from everyone but an admin, so a
 * customer never saw one — but the admin did, on the live homepage, sitting in
 * the pricing grid behind a "only you can see this" badge. That made the page
 * an admin looks at a different page from the one being sold, and the badge was
 * the only thing standing between them and a Pay button that checkout refuses.
 *
 * So the selling pages filter to what is actually on sale, for everyone. The
 * drafts are still there to edit in Admin → Managed Production → Offers, which
 * reads the catalogue unfiltered and is where a half-built gig belongs.
 *
 * A service with no published package is dropped too: a gig whose every tier is
 * a draft has no price, and a price card with nothing to charge is the same
 * dead end one step further in. Quote-only gigs are the exception — they are
 * sold without packages by design.
 */
export function publishedOffers(catalogue: OfferService[]): OfferService[] {
  return catalogue
    .filter((service) => service.isPublished)
    .map((service) => ({
      ...service,
      packages: service.packages.filter((option) => option.isPublished),
    }))
    .filter((service) => service.quoteOnly || service.packages.length > 0)
}

export function serviceFromCatalogue(catalogue: OfferService[], key: string): OfferService | null {
  return catalogue.find((service) => service.key === key) ?? null
}

/**
 * The one place a package is resolved for pricing.
 *
 * Returns null for an unknown or unpublished package rather than a default, so
 * a checkout request naming something that is not for sale is refused instead
 * of quietly priced as the cheapest tier.
 */
export function packageFromCatalogue(
  catalogue: OfferService[],
  serviceKey: string,
  packageKey: string,
): { service: OfferService; option: OfferPackage } | null {
  const service = serviceFromCatalogue(catalogue, serviceKey)
  if (!service) return null
  const option = service.packages.find((entry) => entry.key === packageKey)
  return option ? { service, option } : null
}

/**
 * The tier a brief opens on: the popular one, unless it is sold out, in which
 * case the popular one among those that can still be bought.
 */
export function defaultPackageFor(service: OfferService | null): OfferPackage | null {
  if (!service?.packages.length) return null
  const buyable = service.packages.filter((option) => packagePlacement(option) !== "sold_out")
  const pool = buyable.length ? buyable : service.packages
  return pool.find((option) => option.popular) ?? pool[0]
}

/** The cheapest tier, for the "FROM" price on a gig card. */
export function cheapestPackage(service: OfferService): OfferPackage | null {
  if (!service.packages.length) return null
  return service.packages.reduce((low, option) => (option.priceInr < low.priceInr ? option : low))
}

/* -------------------------------------------------------------------------- */
/* Capacity                                                                    */
/* -------------------------------------------------------------------------- */

/** A row of `managed_offer_availability()` / `admin_managed_capacity()`. */
export type AvailabilityRow = {
  package_key: string
  slot_limit: number | null
  queue_limit: number | null
  slots_taken: number
  queue_taken: number
  queue_waiting: number
  placement: string
  slots_held?: number | null
  held_until?: string | null
}

export function toAvailability(row: AvailabilityRow): PackageAvailability | null {
  const parsed = packageAvailabilitySchema.safeParse({
    slotLimit: row.slot_limit,
    queueLimit: row.queue_limit,
    slotsTaken: Number(row.slots_taken) || 0,
    queueTaken: Number(row.queue_taken) || 0,
    queueWaiting: Number(row.queue_waiting) || 0,
    placement: row.placement,
    slotsHeld: Number(row.slots_held) || 0,
    heldUntil: row.held_until ?? null,
  })
  return parsed.success ? parsed.data : null
}

/** The catalogue with each limited package's live counts attached. */
export function withAvailability(catalogue: OfferService[], rows: AvailabilityRow[]): OfferService[] {
  const byKey = new Map<string, PackageAvailability>()
  for (const row of rows) {
    const availability = toAvailability(row)
    if (availability) byKey.set(row.package_key, availability)
  }
  return catalogue.map((service) => ({
    ...service,
    packages: service.packages.map((option) => ({ ...option, availability: byKey.get(option.key) ?? null })),
  }))
}

/** Where a new order of this package would land. No counts means unlimited. */
export function packagePlacement(option: Pick<OfferPackage, "availability">): PackagePlacement {
  return option.availability?.placement ?? "slot"
}

/**
 * The gig's best answer across its tiers, for the card on /hire-us: open if
 * any tier has a live slot, queueing if any can still be booked, sold out only
 * when none can.
 */
export function servicePlacement(service: Pick<OfferService, "packages" | "quoteOnly">): PackagePlacement {
  if (service.quoteOnly || !service.packages.length) return "slot"
  const placements = service.packages.map(packagePlacement)
  if (placements.includes("slot")) return "slot"
  if (placements.includes("queue")) return "queue"
  return "sold_out"
}

/**
 * One line for a gig card. Counts slots only when every tier still selling a
 * slot is limited — "3 slots left" next to an unlimited tier would be untrue.
 */
export function serviceAvailabilityNote(service: Pick<OfferService, "packages" | "quoteOnly">): string {
  const placement = servicePlacement(service)
  if (placement === "sold_out") return "Sold out"
  if (placement === "queue") return "Slots full — join the queue"
  const open = service.packages.filter((option) => packagePlacement(option) === "slot")
  const left = open.map((option) => slotsLeft(option.availability))
  if (!left.length || left.some((count) => count === null)) return ""
  const total = (left as number[]).reduce((sum, count) => sum + count, 0)
  return `${total} slot${total === 1 ? "" : "s"} left`
}

/** Live slots still free, or null when the package is unlimited. */
export function slotsLeft(availability: PackageAvailability | null): number | null {
  if (!availability || availability.slotLimit === null) return null
  return Math.max(availability.slotLimit - availability.slotsTaken, 0)
}

/**
 * The place a new queue booking would take: everyone already waiting, plus
 * checkouts in progress for a queue place, plus one.
 */
export function nextQueuePlace(availability: PackageAvailability | null): number {
  return (availability?.queueTaken ?? 0) + 1
}

/** One line under a tier, or "" when there is nothing worth saying. */
export function availabilityNote(availability: PackageAvailability | null): string {
  if (!availability) return ""
  if (availability.placement === "sold_out") return "Sold out"
  if (availability.placement === "queue") {
    const hold = holdNote(availability)
    if (hold) return hold
    const left = availability.queueLimit === null ? null : Math.max(availability.queueLimit - availability.queueTaken, 0)
    return left === null ? "Slots full — join the queue" : `Slots full — ${left} queue place${left === 1 ? "" : "s"} left`
  }
  const left = slotsLeft(availability)
  return left === null ? "" : `${left} slot${left === 1 ? "" : "s"} left`
}

/**
 * "Held by a buyer at checkout — free again at 14:25 if unpaid", when the only
 * thing keeping a buyer out of a live slot is someone else's unpaid checkout.
 */
export function holdNote(availability: PackageAvailability | null): string {
  if (!availability?.heldUntil || availability.slotsHeld <= 0 || availability.queueWaiting > 0) return ""
  const until = new Date(availability.heldUntil)
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return ""
  const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  const who = availability.slotsHeld === 1 ? "another buyer" : `${availability.slotsHeld} buyers`
  return `Slot held by ${who} at checkout — free again at ${time} if unpaid`
}

export type CapacityRefusal = { code: "slots_full" | "sold_out"; message: string }

/**
 * Turns the two refusals `create_managed_project` raises into what the buyer
 * is told. Anything else is not a capacity problem and returns null.
 */
export function capacityRefusal(error: unknown): CapacityRefusal | null {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : ""
  if (message.includes("managed_sold_out")) {
    return { code: "sold_out", message: "This package is sold out — every slot and queue place is taken. Choose another package or check back soon." }
  }
  if (message.includes("managed_slots_full")) {
    return { code: "slots_full", message: "The last live slot is held by another buyer at checkout. It frees up within 15 minutes if they don't pay — or book a place in the queue now." }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* What an order remembers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * No per-field defaults, deliberately. An order placed before snapshots existed
 * should parse to `{}` — "we recorded nothing" — rather than to five empty
 * strings that read like recorded values and would shadow the live catalogue in
 * `offerServiceName`.
 */
export const offerSnapshotSchema = z.object({
  serviceKey: z.string(),
  serviceName: z.string(),
  packageKey: z.string(),
  packageName: z.string(),
  packageSummary: z.string(),
}).partial().strip()

export type OfferSnapshot = z.infer<typeof offerSnapshotSchema>

export function parseOfferSnapshot(input: unknown): OfferSnapshot {
  const result = offerSnapshotSchema.safeParse(input ?? {})
  return result.success ? result.data : {}
}

export function snapshotFor(service: OfferService, option: OfferPackage | null): OfferSnapshot {
  return {
    serviceKey: service.key,
    serviceName: service.name,
    packageKey: option?.key ?? "",
    packageName: option?.name ?? "",
    packageSummary: option?.summary ?? "",
  }
}

/**
 * What to call the service an order was placed for.
 *
 * The snapshot first, because it is what the client was actually shown at the
 * moment they paid — renaming a gig, or retiring it altogether, must not
 * rewrite or blank the name on an order that already exists. The key is the
 * last resort, and reads as a key, which is a better failure than "undefined".
 */
export function offerServiceName(snapshot: unknown, serviceKey: string, catalogue?: OfferService[]): string {
  const snap = parseOfferSnapshot(snapshot)
  if (snap.serviceName) return snap.serviceName
  const live = catalogue ? serviceFromCatalogue(catalogue, serviceKey)?.name : null
  return live || serviceKey || "Managed production"
}

export function offerPackageName(snapshot: unknown, packageKey: string): string {
  const snap = parseOfferSnapshot(snapshot)
  return snap.packageName || packageKey || ""
}
