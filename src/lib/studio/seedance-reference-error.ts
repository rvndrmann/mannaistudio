export type SeedanceRejectedReference = {
  contentIndex: number
  referenceIndex: number
}

/**
 * BytePlus numbers the text prompt as content[0], followed by image references.
 * Convert a provider error such as content[4] into the zero-based reference
 * index used by the workspace.
 */
export function parseSeedanceRejectedReference(message: string): SeedanceRejectedReference | null {
  if (!/real person/i.test(message)) return null
  const match = message.match(/content\s*\[\s*(\d+)\s*\]/i)
  if (!match) return null
  const contentIndex = Number(match[1])
  if (!Number.isInteger(contentIndex) || contentIndex < 1) return null
  return { contentIndex, referenceIndex: contentIndex - 1 }
}

export function seedanceReferenceAssetUri(value: unknown): string | null {
  if (typeof value === "string" && /^asset:\/\//i.test(value.trim())) return value.trim()
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const assetUri = (value as Record<string, unknown>).assetUri
  return typeof assetUri === "string" && /^asset:\/\//i.test(assetUri.trim()) ? assetUri.trim() : null
}
