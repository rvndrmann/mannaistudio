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

export function defaultPackageFor(service: OfferService | null): OfferPackage | null {
  if (!service?.packages.length) return null
  return service.packages.find((option) => option.popular) ?? service.packages[0]
}

/** The cheapest tier, for the "FROM" price on a gig card. */
export function cheapestPackage(service: OfferService): OfferPackage | null {
  if (!service.packages.length) return null
  return service.packages.reduce((low, option) => (option.priceInr < low.priceInr ? option : low))
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
