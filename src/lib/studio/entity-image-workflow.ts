import type { MentionableEntity } from "./entity-mentions"

export type BulkEntityImageIntent = {
  types: Array<"character" | "scene" | "prop">
  entityIds?: string[]
  regenerate: boolean
}

export function parseBulkEntityImageIntent(
  message: string,
  mentionedEntities?: Array<{ id: string; name: string; type: "character" | "scene" | "prop" }>
): BulkEntityImageIntent | null {
  const normalized = message.toLowerCase()
  const wantsGeneration = /\b(generate|create|make|draw|render|turnaround)\b/.test(normalized)
  const mentionsImages = /\b(images?|portraits?|references?|visuals?|turnarounds?|look)\b/.test(normalized) || Boolean(mentionedEntities && mentionedEntities.length > 0)
  const mentionsEntities = /\b(characters?|assets?|props?|locations?|scenes?|ghost|monster|entity|entities)\b/.test(normalized) || Boolean(mentionedEntities && mentionedEntities.length > 0)
  
  if (!wantsGeneration || !mentionsEntities) return null
  // A message about a shot is about the storyboard, not the entity library.
  // "create shot image again with better character consistency" names
  // "character", which used to be enough to route it here — and it answered a
  // request to re-render a shot by reporting on reference art instead.
  if (/\b(shots?|storyboards?|keyframes?)\b/.test(normalized)) return null

  const types = new Set<"character" | "scene" | "prop">()
  if (mentionedEntities && mentionedEntities.length > 0) {
    for (const e of mentionedEntities) types.add(e.type)
  }

  if (/\bcharacters?\b/.test(normalized)) types.add("character")
  if (/\b(?:assets?|props?)\b/.test(normalized)) types.add("prop")
  if (/\b(?:assets?|locations?|scenes?)\b/.test(normalized)) types.add("scene")

  if (!types.size) {
    types.add("character")
    types.add("scene")
    types.add("prop")
  }

  return {
    types: Array.from(types),
    entityIds: mentionedEntities && mentionedEntities.length > 0 ? mentionedEntities.map((e) => e.id) : undefined,
    regenerate: /\b(regenerate|redo|replace|refresh|recreate)\b/.test(normalized) || Boolean(mentionedEntities && mentionedEntities.length > 0),
  }
}

export function visualStyleDirective(style: string) {
  const normalized = style.trim().toLowerCase()
  if (normalized.includes("photoreal")) {
    return "Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI."
  }
  if (normalized.includes("realistic") && normalized.includes("3d")) {
    return "High-end realistic 3D cinematic CG with physically based materials, realistic proportions, detailed textures, cinematic lighting, and film-quality rendering. No anime, flat illustration, comic styling, collage, grid, typography, labels, captions, or UI."
  }
  if (normalized.includes("pixar")) return "Polished feature-animation 3D character styling with expressive proportions, cinematic lighting, detailed materials, and a clean studio-quality finish. No collage, grid, typography, labels, captions, or UI."
  if (normalized.includes("anime") || normalized.includes("ghibli") || normalized.includes("shinkai") || normalized.includes("chibi")) {
    return `${style.trim()} visual language with coherent production-ready detail and cinematic lighting. No collage, grid, typography, labels, captions, or UI.`
  }
  return `${style.trim() || "cinematic"} production style with coherent art direction and consistent professional lighting. No collage, grid, typography, labels, captions, or UI.`
}

/**
 * The project's image quality, chosen once in Basic Settings and obeyed by every
 * image generation — chat keyframes, entity reference art, and the storyboard's
 * own generate button — so one setting means one look and one price.
 */
export type ProjectImageQuality = "Low" | "Medium" | "High"

export function projectImageQuality(project: Record<string, unknown>): ProjectImageQuality {
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const value = typeof basicSettings.imageQuality === "string" ? basicSettings.imageQuality.trim().toLowerCase() : ""
  if (value === "low") return "Low"
  if (value === "high") return "High"
  return "Medium"
}

/** The same choice in the casing the OpenAI image endpoints expect. */
export function openAIImageQuality(quality: ProjectImageQuality) {
  return quality.toLowerCase() as "low" | "medium" | "high"
}

export function projectVisualStyle(project: Record<string, unknown>) {
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  if (typeof project.default_style === "string" && project.default_style.trim()) return project.default_style.trim()
  if (typeof basicSettings.visualStyle === "string" && basicSettings.visualStyle.trim()) return basicSettings.visualStyle.trim()
  return "Realistic - Photorealistic"
}

/**
 * @param lookDirectives The project's look clauses, already composed for this
 *   entity's block. Passed in rather than read here so this module stays free of
 *   a cycle with ./style-dna, which needs visualStyleDirective from this one.
 *   Omitted means the project has no extracted look and the style clause alone
 *   describes it.
 */
export function buildEntityReferenceImagePrompt(entity: MentionableEntity, style: string, lookDirectives?: string[]) {
  // Each entity type earns a different frame. A character is only a usable
  // identity lock when the same face is visible from several angles; a location
  // is only a usable backdrop when nobody is standing in it; a prop is only a
  // usable cutout when nothing else shares the frame.
  const subject = entity.type === "character"
    ? `Create a comprehensive photorealistic character reference sheet of “${entity.name}”, organized in a clean cohesive grid layout. The image consists of three distinct sections. SECTION 1 (Left): three full-body standing poses showing the same character in front view, side profile view, and back view. SECTION 2 (Top Right): a horizontal row of headshot portraits displaying five facial expressions: neutral, happy, angry, sad, and surprised. SECTION 3 (Bottom): a row of extreme macro close-up inserts showing eye texture, hair texture, shoe details, fabric stitching, and accessories. Keep the face, hair, body, wardrobe, shoes, and accessories identical across every view. Clean white studio background, soft even commercial lighting, 8K detail, ultra-realistic photography style. No environment, no scene, no other characters, and no props beyond what the character wears or carries.`
    : entity.type === "scene"
    ? `Create one empty establishing plate for the location “${entity.name}”. Render the place itself with nobody in it: no named characters and no background people, crowds, or silhouettes of any kind. Eye-level, neutral perspective. Keep foreground, mid-ground, and background clearly layered with real architectural structure and furniture detail, honest wall and fabric materials, and natural shadows, so characters can be staged anywhere in the depth later. Show the room as it normally is, not mid-scene: no story action and no props that belong to a single moment — those are added per shot.`
    : `Create one production design reference for the ${entity.type === "prop" ? "prop" : "asset"} “${entity.name}” on a plain, uncluttered neutral background. Show exactly one coherent object with a clear silhouette, even lighting, and useful production detail. No scene, no environment, no people, and no hands holding it.`
  return [
    subject,
    entity.description?.trim() ? `Canonical description: ${entity.description.trim()}` : "Preserve the canonical identity implied by the entity name.",
    ...(lookDirectives?.length ? lookDirectives : [`Required project style: ${style || "cinematic"}.`, visualStyleDirective(style)]),
    // The multi-view layout is wanted; rendered text is not. Image models set
    // labels and captions badly, and they contaminate the reference when it is
    // fed back in as a visual input.
    "This is a reusable production reference, so keep it free of written matter: no names, ages, biographies, captions, callouts, borders, panels, watermarks, or any text inside the image.",
  ].join("\n")
}
