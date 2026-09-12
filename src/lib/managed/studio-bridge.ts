import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { brandAssetHandle, entityTypeForBrandAsset, type BrandRecord } from "@/lib/studio/brand"
import { UNVERIFIED_ASSET } from "@/lib/studio/asset-verification"
import { creativeBriefSchema, type CreativeBrief } from "@/lib/studio/domain"
import { briefDigest, creativeBriefFromManagedBrief, parseManagedBrief } from "@/lib/managed-brief"
import { serviceName } from "@/lib/managed-production"
import type { ManagedProjectRow } from "@/lib/managed/server"

/**
 * The bridge between a managed order and the Creator Studio.
 *
 * The internal production is an ordinary `creator_projects` row owned by the
 * admin who opens it, so every existing tool — the Director, the script agents,
 * the storyboard, generation, the timeline — works on it with no special case.
 * What this adds is that it opens already knowing the job: the brief mapped
 * onto `creative_brief` (which the Director reads on every turn), the client's
 * brand facts folded in, and their uploaded product art imported as entities so
 * the first generation has something to lock onto.
 *
 * The client is deliberately *not* made a member of it. Sharing would put the
 * internal project in their Studio, which is the one thing a managed service is
 * supposed to spare them — and would expose every unused take. The only thing
 * that crosses back is a version published through the deliverables area.
 *
 * The brand is read with the service client rather than linked by `brand_id`:
 * `can_access_creator_brand` grants access to a brand's owner and to members of
 * a project produced for it, and the admin here is neither. Copying the facts
 * in keeps the internal project self-contained instead of leaving a brand link
 * the producing admin cannot follow.
 */

export type StudioBridgeResult = {
  projectId: string
  episodeId: string
  importedEntities: number
}

type BrandAssetRow = {
  kind: string
  name: string
  description: string | null
  storage_path: string | null
  external_url: string | null
}

/** Folds the brand room's own rules into the brief the Director will read. */
function withBrandContext(brief: CreativeBrief, brand: BrandRecord | null): CreativeBrief {
  if (!brand) return brief
  const style = [brief.style, brand.visual_style, brand.do_rules ? `Do: ${brand.do_rules}` : ""]
    .filter(Boolean).join(". ").slice(0, 1_000)
  const audience = [brief.audience, brand.audience].filter(Boolean).join(" ").slice(0, 1_000)
  const delivery = [
    brief.deliveryExpectations,
    brand.brand_voice ? `Brand voice: ${brand.brand_voice}` : "",
    brand.dont_rules ? `Never: ${brand.dont_rules}` : "",
    brand.forbidden_claims?.length ? `Forbidden claims: ${brand.forbidden_claims.join(", ")}` : "",
  ].filter(Boolean).join("\n").slice(0, 2_000)

  return creativeBriefSchema.parse({ ...brief, style, audience, deliveryExpectations: delivery })
}

/**
 * Product shots and logos the client attached, as project entities.
 *
 * Everything is a prop rather than a character: a wrongly-created character
 * gets rendered as a person, and a client uploading a bottle has not cast
 * anyone. Only images are imported — a reference video is context for the
 * producer, not something the image pipeline can lock a look onto.
 */
function attachmentEntities(brief: ReturnType<typeof parseManagedBrief>, taken: Set<string>) {
  const wanted = brief.attachments.filter(
    (attachment) =>
      (attachment.kind === "product_image" || attachment.kind === "logo") &&
      (attachment.contentType.startsWith("image/") || !attachment.contentType),
  )

  return wanted.flatMap((attachment, index) => {
    const label = attachment.kind === "logo" ? "Logo" : brief.productName || attachment.name || `Product ${index + 1}`
    let handle = brandAssetHandle(`${label}${index && attachment.kind !== "logo" ? ` ${index + 1}` : ""}`)
    if (taken.has(handle.toLowerCase())) handle = `${handle}_${index + 1}`
    if (taken.has(handle.toLowerCase())) return []
    taken.add(handle.toLowerCase())
    return [{
      type: "prop" as const,
      name: label.slice(0, 80),
      handle,
      description: attachment.kind === "logo" ? "Client logo" : brief.productDescription.slice(0, 500),
      reference_images: [attachment.path],
    }]
  })
}

/**
 * Opens the internal production for a managed order.
 *
 * `admin` is the service client — it reads the client's brand and their
 * uploaded assets, neither of which the producing admin has an RLS path to.
 * `supabase` is the admin's own session, and the project is inserted through it
 * so the row is genuinely theirs rather than a service-role orphan nobody owns.
 */
export async function openStudioProjectForManaged(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  adminId: string,
  project: ManagedProjectRow,
): Promise<StudioBridgeResult> {
  const brief = parseManagedBrief(project.brief)

  let brand: BrandRecord | null = null
  let brandAssets: BrandAssetRow[] = []
  if (project.brand_id) {
    const [{ data: brandRow }, { data: assets }] = await Promise.all([
      admin.from("creator_brands").select("*").eq("id", project.brand_id).maybeSingle(),
      admin.from("creator_brand_assets").select("kind,name,description,storage_path,external_url").eq("brand_id", project.brand_id),
    ])
    brand = (brandRow as BrandRecord) || null
    brandAssets = (assets as BrandAssetRow[]) || []
  }

  const creativeBrief = withBrandContext(
    creativeBriefFromManagedBrief(brief, {
      serviceType: project.service_type,
      durationSeconds: project.duration_seconds,
      aspectRatio: project.aspect_ratio,
    }),
    brand,
  )

  const description = [
    `Managed ${serviceName(project.service_type)} for ${brief.brandName || "a client"}.`,
    `${project.video_count} × ${project.duration_seconds}s, ${project.aspect_ratio}.`,
    "",
    briefDigest(brief),
  ].join("\n").slice(0, 10_000)

  const { data: created, error } = await supabase
    .from("creator_projects")
    .insert({
      user_id: adminId,
      name: `${project.name}`.slice(0, 160),
      description,
      default_aspect: project.aspect_ratio,
      default_style: brand?.visual_style || "photorealistic",
      creative_brief: creativeBrief,
    })
    .select("id")
    .single()
  if (error || !created?.id) throw error || new Error("Could not open the production")

  const studioProjectId = created.id as string

  const { data: episode, error: episodeError } = await supabase
    .from("creator_episodes")
    .insert({
      project_id: studioProjectId,
      name: project.video_count > 1 ? "Ad 01" : project.name.slice(0, 120),
      description: brief.goal ? `Goal: ${brief.goal}` : null,
      order_index: 0,
      status: "in_progress",
    })
    .select("id")
    .single()
  if (episodeError || !episode?.id) throw episodeError || new Error("Could not open the first episode")

  await supabase.from("creator_chat_sessions").insert({
    episode_id: episode.id,
    user_id: adminId,
    title: "AI Director",
  })

  const taken = new Set<string>()
  const imports = [
    ...brandAssets.flatMap((asset) => {
      const image = (asset.storage_path || "").trim() || (asset.external_url || "").trim()
      if (!image) return []
      const handle = brandAssetHandle(asset.name)
      if (taken.has(handle.toLowerCase())) return []
      taken.add(handle.toLowerCase())
      return [{
        type: entityTypeForBrandAsset(asset.kind),
        name: asset.name,
        handle,
        description: asset.description || "",
        reference_images: [image],
      }]
    }),
    ...attachmentEntities(brief, taken),
  ]

  let importedEntities = 0
  if (imports.length) {
    const { error: entityError } = await supabase.from("creator_entities").insert(
      imports.map((entity) => ({
        project_id: studioProjectId,
        type: entity.type,
        name: entity.name,
        handle: entity.handle,
        description: entity.description || null,
        reference_images: entity.reference_images,
        // Client-supplied art, not registered with the generation provider, so
        // it starts untrusted like any other upload.
        source_type: UNVERIFIED_ASSET.source_type,
        byteplus_asset_class: UNVERIFIED_ASSET.byteplus_asset_class,
        metadata: { imported_from_managed: project.id },
      })),
    )
    if (entityError) {
      // A missing reference is a slower first generation, not a reason to throw
      // away a production that otherwise opened correctly.
      console.warn("Could not import managed brief assets:", entityError.message)
    } else {
      importedEntities = imports.length
    }
  }

  return { projectId: studioProjectId, episodeId: episode.id, importedEntities }
}
