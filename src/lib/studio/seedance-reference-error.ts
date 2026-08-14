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

export type SeedanceMissingAsset = {
  assetId: string
  contentIndex: number | null
  referenceIndex: number | null
}

export function parseSeedanceMissingAssetError(message: string): SeedanceMissingAsset | null {
  if (!/not found/i.test(message) && !/not valid/i.test(message)) return null
  const assetMatch = message.match(/(?:asset\s+|asset:\/\/)(asset-[a-z0-9-]+|[a-z0-9-]+)/i) || message.match(/specified asset ([^\s]+) is not found/i)
  if (!assetMatch) return null
  const assetId = assetMatch[1].replace(/^asset:\/\//i, "").trim()
  const contentMatch = message.match(/content\s*\[\s*(\d+)\s*\]/i)
  const contentIndex = contentMatch ? Number(contentMatch[1]) : null
  const referenceIndex = contentIndex !== null && contentIndex >= 1 ? contentIndex - 1 : null
  return { assetId, contentIndex, referenceIndex }
}

export async function purgeStaleBytePlusAsset(supabase: { from: (table: string) => any }, assetId: string, projectId?: string) {
  const cleanId = assetId.replace(/^asset:\/\//i, "").trim()
  if (!cleanId) return

  try {
    let entityQuery = supabase.from("creator_entities").update({
      byteplus_asset_id: null,
      byteplus_asset_uri: null,
      verification_status: null,
    })
    if (projectId) entityQuery = entityQuery.eq("project_id", projectId)
    await entityQuery.or(`byteplus_asset_id.eq.${cleanId}`)

    await supabase.from("creator_byteplus_assets").delete().eq("asset_id", cleanId)

    if (projectId) {
      const { data: shots } = await supabase.from("creator_shots").select("id,metadata")
      for (const shot of shots || []) {
        const meta = shot.metadata && typeof shot.metadata === "object" ? shot.metadata as Record<string, unknown> : {}
        if (meta.byteplus_asset_id === cleanId) {
          delete meta.byteplus_asset_id
          await supabase.from("creator_shots").update({ metadata: meta }).eq("id", shot.id)
        }
      }
    }
  } catch (err) {
    console.warn(`Could not purge stale BytePlus asset ${cleanId}:`, err)
  }
}

