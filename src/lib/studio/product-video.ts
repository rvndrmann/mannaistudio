export const PRODUCT_INTERACTIONS = ["automatic", "wear", "hold", "use"] as const
export type ProductVideoSettings = { enabled: boolean; entityId: string; interaction: typeof PRODUCT_INTERACTIONS[number] }
export function readProductVideo(metadata: unknown): ProductVideoSettings {
  const meta = metadata as { basic_settings?: { productVideo?: Partial<ProductVideoSettings> } } | null
  const value = meta?.basic_settings?.productVideo
  return { enabled: value?.enabled === true, entityId: typeof value?.entityId === "string" ? value.entityId : "", interaction: PRODUCT_INTERACTIONS.includes(value?.interaction as ProductVideoSettings["interaction"]) ? value!.interaction! : "automatic" }
}

/**
 * What the product is and how a person carries it, read once from its image.
 *
 * "Automatic" used to be a sentence handed to whichever model came next:
 * "choose wearing for footwear, holding for handheld products". The Director
 * could act on that, but the same sentence was also pasted into the prompt for
 * the image model, which cannot choose anything — it saw the word "holding" and
 * a shoe, and drew the shoe in a hand. The decision is now made once, by a model
 * that looks at the product, and every later stage is told the answer.
 */
export const PRODUCT_PLACEMENTS = ["worn", "held", "used", "placed"] as const
export type ProductPlacement = typeof PRODUCT_PLACEMENTS[number]
export type ProductProfile = {
  /** What it is, in a few words: "running shoe", "wrist watch", "serum bottle". */
  category: string
  /** Only what is visible: shape, colours, materials, branding. */
  description: string
  placement: ProductPlacement
  /** Where on the body or in the scene: "on both feet", "on the left wrist". */
  where: string
  /** One sentence an image model can follow as written. */
  howToShow: string
  /** The mistake to rule out: "never carried in a hand". */
  avoid: string
  /** The reference image this was read from; a new image means a new reading. */
  source: string
  analysedAt: string
}

export const PRODUCT_PROFILE_INSTRUCTIONS = `You look at one product photo for an advertising production and say what the product is and how a person naturally carries it on camera.

Reply with one JSON object and nothing else:
{
  "category": "what it is in 2-5 words, e.g. running shoe, wrist watch, serum bottle, backpack",
  "description": "only what is visible: shape, colours, materials, branding. No invented details. Max 300 characters.",
  "placement": "worn | held | used | placed",
  "where": "where on the body or in the scene, e.g. on both feet, on the left wrist, on the face, in one hand, on a table. Max 80 characters.",
  "howToShow": "one sentence an image model can follow literally, describing the person with this product in its natural position. Max 240 characters.",
  "avoid": "the unnatural placement to rule out for this product. Max 160 characters."
}

Choosing placement:
- worn: anything that goes on the body. Footwear goes on the feet. Garments, eyewear, watches, jewellery, hats, bags and headphones go where they are worn.
- held: small items a person naturally keeps in a hand, such as a phone, a bottle, a can, a cosmetic tube.
- used: items shown in operation, such as a tool, an appliance, a vehicle, sports equipment.
- placed: items that sit in the scene and are not carried, such as furniture or decor.

Footwear is never "held". A wearable is "held" only if it clearly cannot be worn.`

const clip = (value: unknown, limit: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "")

export function normalizeProductProfile(raw: unknown, source: string, analysedAt = new Date().toISOString()): ProductProfile | null {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const placement = PRODUCT_PLACEMENTS.find((option) => option === clip(value.placement, 20).toLowerCase())
  const category = clip(value.category, 80)
  const howToShow = clip(value.howToShow, 240)
  if (!placement || !category || !howToShow || !source) return null
  return { category, description: clip(value.description, 300), placement, where: clip(value.where, 80), howToShow, avoid: clip(value.avoid, 160), source, analysedAt }
}

/** The stored reading, or null when there is none or it was made from a different image. */
export function readProductProfile(entityMetadata: unknown, currentSource?: string): ProductProfile | null {
  const stored = (entityMetadata as { product_profile?: unknown } | null)?.product_profile as Partial<ProductProfile> | undefined
  if (!stored || typeof stored.source !== "string") return null
  if (currentSource !== undefined && stored.source !== currentSource) return null
  return normalizeProductProfile(stored, stored.source, typeof stored.analysedAt === "string" ? stored.analysedAt : undefined)
}

export type ProductReading = { name: string; profile: ProductProfile | null }

const chosenPlacement: Record<Exclude<ProductVideoSettings["interaction"], "automatic">, ProductPlacement> = { wear: "worn", hold: "held", use: "used" }
const placementWords: Record<ProductPlacement, string> = {
  worn: "worn on the body where it belongs",
  held: "held naturally in the hand",
  used: "in use, the way it is operated",
  placed: "placed in the scene, not carried",
}

/**
 * How the product appears with a person, as one concrete sentence.
 *
 * The user's own choice in Product video settings wins over the reading; the
 * reading's wording is kept only when it describes that same placement.
 */
const avoidClause = (avoid: string) => (avoid ? ` Avoid: ${avoid.replace(/[.\s]+$/, "")}.` : "")

export function productPlacementLine(settings: ProductVideoSettings, product?: ProductReading | null, options?: { forImageModel?: boolean }): string {
  const profile = product?.profile || null
  const name = product?.name ? `@${product.name}` : "the product"
  if (settings.interaction !== "automatic") {
    const placement = chosenPlacement[settings.interaction]
    if (profile && profile.placement === placement) return `${name} (${profile.category}) is ${placement}${profile.where ? ` ${profile.where}` : ""}. ${profile.howToShow}`
    return `${name}${profile ? ` (${profile.category})` : ""} is ${placementWords[placement]}.`
  }
  // An image model draws the nouns it is given, negated or not, so the thing to
  // avoid is told only to the models that can read a sentence.
  if (profile) return `${name} (${profile.category}) is ${profile.placement}${profile.where ? ` ${profile.where}` : ""}. ${profile.howToShow}${options?.forImageModel ? "" : avoidClause(profile.avoid)}`
  return `${name} is shown the way it is naturally used: footwear on the feet, garments, eyewear, watches and jewellery worn where they belong, and only handheld items held in a hand.`
}

/** The Director's brief: what the product is, and that each scene must say how it appears. */
export function productVideoInstructions(settings: ProductVideoSettings, product?: ProductReading | null): string {
  if (!settings.enabled) return ""
  const profile = product?.profile || null
  return [
    `PRODUCT VIDEO: Inspect the supplied product image visually BEFORE writing the master prompt, character descriptions, assets or storyboard. Describe its visible category, geometry, colours, materials, branding and wear/use constraints; do not invent unseen details.`,
    profile ? `Product reading (made from the product image): ${profile.category}. ${profile.description}` : "",
    `Interaction: ${settings.interaction}. Default placement: ${productPlacementLine(settings, product)}`,
    `For every scene, work out from the script how the product appears in that moment and write it into the shot in plain words: where it is on the body or in the frame, and what the person is doing with it. Use the default placement unless the script clearly calls for something else, such as unboxing, lacing up or a product-only close-up. Never leave the placement for the image or video model to guess, and never write "holding" for a product that is worn.`,
    `Keep the person's identity while fitting the exact supplied product onto them; allow only the wardrobe change needed for this product. Preserve product scale, markings and construction, realistic fit, grip, contact and anatomy. Reuse the supplied product entity and its original image, never generate a replacement product. Include that product's canonical @name and entity id in every character or shot that wears, holds or uses it, and carry the product image into those generations alongside character references. Product-only shots should omit unrelated characters. If the image is unavailable, stop and request a readable product image before authoring.`,
  ].filter(Boolean).join(" ")
}

/**
 * The same decision, written for an image model.
 *
 * An image model follows nouns, not conditionals, so this states the one
 * placement that applies and leaves the alternatives out.
 */
export function productArtDirective(settings: ProductVideoSettings, product?: ProductReading | null): string {
  if (!settings.enabled) return ""
  return `Show this character with the exact product from the attached product image. ${productPlacementLine(settings, product, { forImageModel: true })} Keep the person's identity and change only the wardrobe this product requires. Match the product's shape, colours, markings and scale exactly, with realistic fit, contact and anatomy. Do not add an extra copy of the product elsewhere in the frame.`
}

/**
 * Where every pictured prop goes, for productions that never opened Product
 * video settings. Read from each prop's own image, so a boot is on a foot and a
 * ball is at one, whichever of them the advert is for.
 */
export function propPlacementInstructions(readings: ProductReading[]): string {
  const lines = readings.filter((reading) => reading.profile).map((reading) => {
    const profile = reading.profile!
    return `- @${reading.name}: ${profile.category}, ${profile.placement}${profile.where ? ` ${profile.where}` : ""}. ${profile.howToShow}${avoidClause(profile.avoid)}`
  })
  if (!lines.length) return ""
  return [
    "HOW EACH PRODUCT AND PROP APPEARS (read from its reference image):",
    ...lines,
    `For every shot that includes one of these, work out from the script how it appears in that moment and write it into the shot in plain words: where it is on the body or in the frame, and what the person is doing with it. Use the placement above unless the script clearly calls for something else, such as unboxing or a product-only close-up. Never write "holding" for something that is worn. When a character is the one wearing or using it, say so in that character's description and reference art as well.`,
  ].join("\n")
}
