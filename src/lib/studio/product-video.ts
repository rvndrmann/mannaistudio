export const PRODUCT_INTERACTIONS = ["automatic", "wear", "hold", "use"] as const
export type ProductVideoSettings = { enabled: boolean; entityId: string; interaction: typeof PRODUCT_INTERACTIONS[number] }
export function readProductVideo(metadata: unknown): ProductVideoSettings {
  const meta = metadata as { basic_settings?: { productVideo?: Partial<ProductVideoSettings> } } | null
  const value = meta?.basic_settings?.productVideo
  return { enabled: value?.enabled === true, entityId: typeof value?.entityId === "string" ? value.entityId : "", interaction: PRODUCT_INTERACTIONS.includes(value?.interaction as ProductVideoSettings["interaction"]) ? value!.interaction! : "automatic" }
}
export function productVideoInstructions(settings: ProductVideoSettings): string {
  if (!settings.enabled) return ""
  return `PRODUCT VIDEO: Inspect the supplied product image visually BEFORE writing the master prompt, character descriptions, assets or storyboard. Describe its visible category, geometry, colours, materials, branding and wear/use constraints; do not invent unseen details. Interaction: ${settings.interaction}. Automatic means choose wearing for garments/footwear, holding for handheld products, and realistic use for other products. Keep the person's identity while fitting the exact supplied product onto them; allow only the wardrobe change needed for this product. Preserve product scale, markings and construction, realistic fit, grip, contact and anatomy. Reuse the supplied product entity and its original image, never generate a replacement product. Include that product's canonical @name and entity id in every character or shot that wears, holds or uses it, and carry the product image into those generations alongside character references. Product-only shots should omit unrelated characters. If the image is unavailable, stop and request a readable product image before authoring.`
}
