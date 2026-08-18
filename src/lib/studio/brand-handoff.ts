import type { SupabaseClient, User } from "@supabase/supabase-js"
import { brandEntityImports, creativeBriefFromBrand, type BrandRecord } from "./brand"
import { UNVERIFIED_ASSET } from "./asset-verification"
import { isMissingProductionModeSchema } from "./domain"
import { normalizeScriptContent, type ScriptContent } from "./script"

/**
 * Handing a finished script to the studio.
 *
 * The seam between the brand room and production, shared by the Scripts panel
 * and the website chat so a script started in either place lands the same way:
 * saved on an episode, with the brand's own art imported as project assets and
 * the project remembering which brand it belongs to.
 */
export type BrandScriptHandoff = {
  supabase: SupabaseClient
  user: User
  brand: BrandRecord & { user_id?: string }
  script: { id?: string; title: string; content: unknown; notes?: string }
  projectId?: string
  projectName?: string
  episodeId?: string
  importAssets?: boolean
}

export type BrandScriptHandoffResult = {
  projectId: string
  episodeId: string
  importedEntities: number
  content: ScriptContent
}

export class BrandHandoffError extends Error {
  constructor(message: string, public readonly status: 400 | 404 = 400) {
    super(message)
    this.name = "BrandHandoffError"
  }
}

export async function sendBrandScriptToProject(input: BrandScriptHandoff): Promise<BrandScriptHandoffResult> {
  const { supabase, user, brand, script } = input
  const content = normalizeScriptContent(script.content)
  if (!content.body.trim() && !content.scenes.length) {
    throw new BrandHandoffError("This script is empty. Write or paste the script before sending it to production.")
  }

  let projectId = input.projectId || ""
  if (projectId) {
    // RLS decides whether this user may write to the project; one they cannot
    // reach reads back as missing.
    const { data: existing } = await supabase.from("creator_projects").select("id").eq("id", projectId).maybeSingle()
    if (!existing) throw new BrandHandoffError("Project not found", 404)
  } else {
    const name = (input.projectName || script.title || brand.name).slice(0, 160)
    const values: Record<string, unknown> = {
      user_id: user.id,
      name,
      description: content.overview || script.notes || null,
      default_aspect: brand.default_aspect || "9:16",
      default_style: brand.visual_style || "photorealistic",
    }
    const insertProject = (payload: Record<string, unknown>) => supabase.from("creator_projects").insert(payload).select("id").single()
    let { data: created, error: createError } = await insertProject({
      ...values,
      brand_id: brand.id,
      creative_brief: creativeBriefFromBrand(brand, { title: script.title, overview: content.overview }),
    })
    // brand_id and creative_brief ship with migrations. On a deployment that has
    // not applied them the handoff still has to work, so it retries with the
    // columns the database actually has rather than refusing the script.
    if (createError && (isMissingProductionModeSchema(createError) || createError.code === "42703")) {
      console.warn("Brand columns are missing on creator_projects; run the pending migrations to link brands to projects.")
      ;({ data: created, error: createError } = await insertProject(values))
    }
    if (createError) throw createError
    projectId = created?.id || ""
  }
  if (!projectId) throw new BrandHandoffError("Could not open a production for this script")

  let episodeId = input.episodeId || ""
  if (episodeId) {
    const { data: episode } = await supabase.from("creator_episodes").select("id").eq("id", episodeId).eq("project_id", projectId).maybeSingle()
    if (!episode) throw new BrandHandoffError("Episode not found", 404)
  } else {
    const { data: firstEpisode } = await supabase.from("creator_episodes").select("id").eq("project_id", projectId).order("order_index", { ascending: true }).limit(1).maybeSingle()
    if (firstEpisode) {
      episodeId = firstEpisode.id
    } else {
      const { data: newEpisode, error: episodeError } = await supabase
        .from("creator_episodes")
        .insert({ project_id: projectId, name: script.title || "Episode 1", order_index: 0, status: "draft" })
        .select("id")
        .single()
      if (episodeError) throw episodeError
      episodeId = newEpisode.id
      await supabase.from("creator_chat_sessions").insert({ episode_id: episodeId, user_id: user.id, title: "AI Director" })
    }
  }

  const { error: scriptWriteError } = await supabase
    .from("creator_episodes")
    .update({ script_content: content, script_updated_at: new Date().toISOString() })
    .eq("id", episodeId)
    .eq("project_id", projectId)
  if (scriptWriteError) throw scriptWriteError

  let importedEntities = 0
  if (input.importAssets !== false) {
    const [{ data: assets }, { data: entities }] = await Promise.all([
      supabase.from("creator_brand_assets").select("kind,name,description,storage_path,external_url").eq("brand_id", brand.id),
      supabase.from("creator_entities").select("handle").eq("project_id", projectId),
    ])
    const imports = brandEntityImports(assets || [], (entities || []).map((entity) => String(entity.handle || "")))
    if (imports.length) {
      const { error: entityError } = await supabase.from("creator_entities").insert(imports.map((entity) => ({
        project_id: projectId,
        type: entity.type,
        name: entity.name,
        handle: entity.handle,
        description: entity.description || null,
        reference_images: entity.reference_images,
        // Brand art is supplied by the user, not registered with the generation
        // provider, so it starts untrusted like any upload.
        source_type: UNVERIFIED_ASSET.source_type,
        byteplus_asset_class: UNVERIFIED_ASSET.byteplus_asset_class,
        metadata: { imported_from_brand: brand.id },
      })))
      if (entityError) throw entityError
      importedEntities = imports.length
    }
  }

  // Linking after the fact covers the case where an existing project was
  // picked, which had no brand until now.
  const { error: linkError } = await supabase.from("creator_projects").update({ brand_id: brand.id }).eq("id", projectId)
  if (linkError && linkError.code !== "42703") throw linkError

  return { projectId, episodeId, importedEntities, content }
}
