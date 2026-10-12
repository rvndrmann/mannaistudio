import type { SupabaseClient } from "@supabase/supabase-js"
import { runUserProvider } from "@/lib/byok/run-user-provider"
import { inlineImage } from "./director-vision"
import { entityPrimaryReference } from "./entity-mentions"
import { analyzeImagesAsJson } from "./openai"
import { normalizeProductProfile, PRODUCT_PROFILE_INSTRUCTIONS, readProductProfile, type ProductReading } from "./product-video"

const MEDIA_BUCKET = "creator-studio-media"
const MAX_PRODUCT_IMAGE_BYTES = 4 * 1024 * 1024

type PropRow = { id: string; name: string; description?: string | null; reference_images?: string[] | null; primary_reference_image?: string | null; metadata?: unknown }
const PROP_COLUMNS = "id,name,description,reference_images,primary_reference_image,metadata"

async function readEntity(input: { supabase: SupabaseClient; userId: string; projectId: string }, entity: PropRow): Promise<ProductReading> {
  const source = entityPrimaryReference(entity)
  if (!source) return { name: entity.name, profile: null }
  const stored = readProductProfile(entity.metadata, source)
  if (stored) return { name: entity.name, profile: stored }

  const url = /^https?:\/\//i.test(source)
    ? source
    : (await input.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(source, 60 * 60)).data?.signedUrl
  const inlined = url ? await inlineImage(url, MAX_PRODUCT_IMAGE_BYTES) : null
  if (!inlined) return { name: entity.name, profile: null }

  const raw = await runUserProvider(input.userId, "openai", () => analyzeImagesAsJson({
    userId: input.userId,
    instructions: PRODUCT_PROFILE_INSTRUCTIONS,
    text: [`Product name: ${entity.name}.`, entity.description ? `Notes from the user: ${String(entity.description).slice(0, 500)}` : "", "Return the JSON reading for this product."].filter(Boolean).join(" "),
    imageUrls: [inlined.dataUrl],
  }))
  const profile = normalizeProductProfile(raw, source)
  if (!profile) return { name: entity.name, profile: null }

  const { error: saveError } = await input.supabase.from("creator_entities")
    .update({ metadata: { ...((entity.metadata as Record<string, unknown> | null) || {}), product_profile: profile } })
    .eq("id", entity.id).eq("project_id", input.projectId)
  if (saveError) console.warn("Could not save the product reading:", saveError.message)
  return { name: entity.name, profile }
}

/**
 * The product's reading, made on first use and kept on the entity.
 *
 * One vision call per product image: the result is stored beside the image it
 * was read from, so a later turn reads it back and a replaced image is read
 * again. Never throws — a product video without a reading still works from the
 * general placement rule, which is better than a turn that fails because the
 * analysis did.
 */
export async function ensureProductProfile(input: {
  supabase: SupabaseClient
  userId: string
  projectId: string
  entityId: string
}): Promise<ProductReading | null> {
  try {
    const { data: entity, error } = await input.supabase.from("creator_entities")
      .select(PROP_COLUMNS).eq("project_id", input.projectId).eq("id", input.entityId).single()
    if (error || !entity) return null
    return await readEntity(input, entity as PropRow)
  } catch (error) {
    console.warn("Could not read the product image:", error)
    return null
  }
}

/** New readings made in one turn; the rest are picked up on the turns after. */
const MAX_NEW_READINGS_PER_TURN = 4

/**
 * Readings for every prop in the project that has a picture.
 *
 * A product does not have to be chosen in Product video settings to be worn:
 * a boot saved as an ordinary prop was planned as something to carry, because
 * nothing had looked at it. Props already read cost one query here.
 */
export async function ensurePropReadings(input: {
  supabase: SupabaseClient
  userId: string
  projectId: string
}): Promise<Array<ProductReading & { id: string }>> {
  try {
    const { data, error } = await input.supabase.from("creator_entities")
      .select(PROP_COLUMNS).eq("project_id", input.projectId).eq("type", "prop").order("created_at", { ascending: true }).limit(40)
    if (error || !data) return []
    const props = (data as PropRow[]).filter((entity) => entityPrimaryReference(entity))
    let fresh = 0
    const readings = await Promise.all(props.map(async (entity) => {
      const stored = readProductProfile(entity.metadata, entityPrimaryReference(entity))
      if (stored) return { id: entity.id, name: entity.name, profile: stored }
      if (fresh >= MAX_NEW_READINGS_PER_TURN) return null
      fresh += 1
      try {
        return { id: entity.id, ...(await readEntity(input, entity)) }
      } catch (readError) {
        console.warn(`Could not read the image for ${entity.name}:`, readError)
        return null
      }
    }))
    return readings.filter((reading): reading is ProductReading & { id: string } => Boolean(reading?.profile))
  } catch (error) {
    console.warn("Could not read the project's prop images:", error)
    return []
  }
}
