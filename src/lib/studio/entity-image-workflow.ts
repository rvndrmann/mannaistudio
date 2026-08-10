import type { MentionableEntity } from "./entity-mentions"

export type BulkEntityImageIntent = {
  types: Array<"character" | "scene" | "prop">
  regenerate: boolean
}

export function parseBulkEntityImageIntent(message: string): BulkEntityImageIntent | null {
  const normalized = message.toLowerCase()
  const wantsGeneration = /\b(generate|create|make|draw|render)\b/.test(normalized)
  const mentionsImages = /\b(images?|portraits?|references?|visuals?)\b/.test(normalized)
  const mentionsEntities = /\b(characters?|assets?|props?|locations?|scenes?)\b/.test(normalized)
  const requestsMultiple = /\b(all|every|each|remaining|missing)\b/.test(normalized)
    || /\b(characters|assets|props|locations|scenes)\s+(?:reference\s+)?images?\b/.test(normalized)
  if (!wantsGeneration || !mentionsImages || !mentionsEntities || !requestsMultiple) return null

  const types = new Set<"character" | "scene" | "prop">()
  if (/\bcharacters?\b/.test(normalized)) types.add("character")
  if (/\b(?:assets?|props?)\b/.test(normalized)) types.add("prop")
  if (/\b(?:assets?|locations?|scenes?)\b/.test(normalized)) types.add("scene")
  if (!types.size) return null

  return {
    types: Array.from(types),
    regenerate: /\b(regenerate|redo|replace|refresh|recreate)\b/.test(normalized),
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

export function projectVisualStyle(project: Record<string, unknown>) {
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  if (typeof project.default_style === "string" && project.default_style.trim()) return project.default_style.trim()
  if (typeof basicSettings.visualStyle === "string" && basicSettings.visualStyle.trim()) return basicSettings.visualStyle.trim()
  return "Realistic - Photorealistic"
}

export function buildEntityReferenceImagePrompt(entity: MentionableEntity, style: string) {
  const subject = entity.type === "character"
    ? `Create one production reference portrait for the character “${entity.name}”. Show exactly one character in a clean full-body or three-quarter view with a neutral, readable pose.`
    : `Create one production design reference image for the ${entity.type === "scene" ? "location/scene" : "prop/asset"} “${entity.name}”. Show exactly one coherent asset design with a clear silhouette and useful production detail.`
  return [
    subject,
    entity.description?.trim() ? `Canonical description: ${entity.description.trim()}` : "Preserve the canonical identity implied by the entity name.",
    `Required project style: ${style || "cinematic"}.`,
    visualStyleDirective(style),
    "This is a reusable production reference image, not a character card or presentation sheet. Do not add names, ages, biographies, borders, panels, or written text inside the image.",
  ].join("\n")
}
