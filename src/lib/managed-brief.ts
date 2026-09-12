import { z } from "zod"
import { creativeBriefSchema, type CreativeBrief } from "@/lib/studio/domain"
import { MANAGED_SERVICE_KEYS, serviceName } from "@/lib/managed-production"

/**
 * The brief a client fills in, and how it becomes something the Director can
 * read.
 *
 * Stored whole as `managed_projects.brief` rather than shredded into columns:
 * the questions differ per service and will keep changing, and a producer reads
 * a brief as a document. What does get mapped out of it is the subset the
 * Creator Studio already has a shape for — `creativeBriefSchema` — so the
 * internal production opens with the objective, audience, offer and style
 * already filled in rather than with an empty form and a link to a PDF.
 *
 * Nearly every field is optional with an empty default. A brief is a
 * conversation starter; refusing an order because someone left "gender if
 * relevant" blank would lose the order, and the chat exists to fill the gaps.
 */

const text = (max: number) => z.string().trim().max(max).default("")
const list = (max: number) => z.array(z.string().trim().min(1).max(300)).max(max).default([])

/** A file the client attached, as the upload route returns it. */
export const managedAttachmentSchema = z.object({
  path: z.string().trim().min(1).max(500),
  name: text(300),
  contentType: text(120),
  kind: z.enum(["logo", "product_image", "product_video", "brand_guideline", "reference", "attachment"]).default("attachment"),
}).strict()

export type ManagedAttachment = z.infer<typeof managedAttachmentSchema>

export const managedBriefSchema = z.object({
  // 1. Brand
  brandName: text(200),
  brandWebsite: text(500),
  productName: text(200),
  productUrl: text(500),
  industry: text(200),
  productDescription: text(4_000),

  // 2. Campaign goal
  goal: text(120),
  goalNotes: text(2_000),

  // 3. Audience
  audience: text(2_000),
  market: text(200),
  ageRange: text(80),
  gender: text(80),
  painPoint: text(2_000),
  whyBuy: text(2_000),

  // 4. Creative direction
  styles: list(12),
  mustInclude: text(2_000),
  mustAvoid: text(2_000),
  referenceLinks: list(12),

  // 5. Offer / CTA
  price: text(120),
  offer: text(1_000),
  discount: text(200),
  cta: text(120),
  landingPageUrl: text(500),

  // 6. Requirements
  aspectRatio: z.string().trim().max(20).default("9:16"),
  platforms: list(10),
  extraVersions: text(1_000),
  notes: text(4_000),

  attachments: z.array(managedAttachmentSchema).max(40).default([]),
}).strict()

export type ManagedBrief = z.infer<typeof managedBriefSchema>

export const managedServiceKeySchema = z.enum(MANAGED_SERVICE_KEYS)

export function emptyManagedBrief(): ManagedBrief {
  return managedBriefSchema.parse({})
}

export function parseManagedBrief(input: unknown): ManagedBrief {
  const result = managedBriefSchema.safeParse(input ?? {})
  return result.success ? result.data : emptyManagedBrief()
}

/**
 * Maps the client's answers onto the Creator Studio's own brief shape.
 *
 * This is the handoff. `creator_projects.creative_brief` is what the Director
 * and the script agents already read at generation time, so writing the managed
 * brief into it means the internal production starts knowing the objective,
 * the audience, the offer and the look — rather than the producer re-typing the
 * brief into the chat and losing half of it.
 */
export function creativeBriefFromManagedBrief(
  brief: ManagedBrief,
  options: { serviceType: string; durationSeconds: number; aspectRatio: string },
): CreativeBrief {
  const objective = [
    `${serviceName(options.serviceType)} for ${brief.productName || brief.brandName || "the client's product"}.`,
    brief.goal ? `Goal: ${brief.goal}.` : "",
    brief.goalNotes,
  ].filter(Boolean).join(" ").trim()

  const audience = [
    brief.audience,
    brief.market ? `Market: ${brief.market}.` : "",
    brief.ageRange ? `Age: ${brief.ageRange}.` : "",
    brief.gender ? `Gender: ${brief.gender}.` : "",
    brief.painPoint ? `Pain point: ${brief.painPoint}` : "",
    brief.whyBuy ? `Why they buy: ${brief.whyBuy}` : "",
  ].filter(Boolean).join(" ").trim()

  const offer = [
    brief.offer,
    brief.price ? `Price: ${brief.price}.` : "",
    brief.discount ? `Discount: ${brief.discount}.` : "",
    brief.cta ? `CTA: ${brief.cta}.` : "",
    brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : "",
  ].filter(Boolean).join(" ").trim()

  const style = [
    brief.styles.join(", "),
    brief.mustInclude ? `Must include: ${brief.mustInclude}` : "",
    brief.mustAvoid ? `Avoid: ${brief.mustAvoid}` : "",
  ].filter(Boolean).join(". ").trim()

  return creativeBriefSchema.parse({
    objective: objective.slice(0, 2_000),
    audience: audience.slice(0, 1_000),
    platform: brief.platforms.join(", ").slice(0, 100),
    durationSeconds: options.durationSeconds,
    aspectRatio: options.aspectRatio,
    style: style.slice(0, 1_000),
    productOrService: [brief.productName, brief.productDescription].filter(Boolean).join(" — ").slice(0, 2_000),
    offer: offer.slice(0, 2_000),
    deliveryExpectations: brief.notes.slice(0, 2_000),
    // Everything above came from the client rather than from the Director
    // guessing, so it is confirmed: the Director should be producing, not
    // asking the producer questions the client already answered.
    confirmedFields: [
      "objective", "audience", "platform", "durationSeconds",
      "productOrService", "style", "offer",
    ],
  })
}

/** The brief as a producer reads it — used for the studio project description. */
export function briefDigest(brief: ManagedBrief): string {
  const lines: Array<[string, string]> = [
    ["Brand", brief.brandName],
    ["Website", brief.brandWebsite],
    ["Product", brief.productName],
    ["Product URL", brief.productUrl],
    ["Industry", brief.industry],
    ["About the product", brief.productDescription],
    ["Goal", [brief.goal, brief.goalNotes].filter(Boolean).join(" — ")],
    ["Audience", brief.audience],
    ["Market", brief.market],
    ["Age", brief.ageRange],
    ["Gender", brief.gender],
    ["Pain point", brief.painPoint],
    ["Why they buy", brief.whyBuy],
    ["Creative direction", brief.styles.join(", ")],
    ["Must include", brief.mustInclude],
    ["Must avoid", brief.mustAvoid],
    ["References", brief.referenceLinks.join("\n")],
    ["Price", brief.price],
    ["Offer", brief.offer],
    ["Discount", brief.discount],
    ["CTA", brief.cta],
    ["Landing page", brief.landingPageUrl],
    ["Platforms", brief.platforms.join(", ")],
    ["Other versions", brief.extraVersions],
    ["Notes", brief.notes],
  ]
  return lines.filter(([, value]) => value && value.trim()).map(([label, value]) => `${label}: ${value}`).join("\n")
}

/**
 * The fields worth carrying into a repeat campaign.
 *
 * Brand, product, audience and platforms are stable; the offer, the goal, the
 * creative direction and the attachments are what a new campaign is *for*, so
 * they start empty rather than quietly repeating last month's sale.
 */
export function repeatBriefFrom(brief: ManagedBrief): ManagedBrief {
  return managedBriefSchema.parse({
    brandName: brief.brandName,
    brandWebsite: brief.brandWebsite,
    productName: brief.productName,
    productUrl: brief.productUrl,
    industry: brief.industry,
    productDescription: brief.productDescription,
    audience: brief.audience,
    market: brief.market,
    ageRange: brief.ageRange,
    gender: brief.gender,
    painPoint: brief.painPoint,
    whyBuy: brief.whyBuy,
    aspectRatio: brief.aspectRatio,
    platforms: brief.platforms,
  })
}
