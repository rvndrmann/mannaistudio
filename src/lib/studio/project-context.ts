import type { SupabaseClient } from "@supabase/supabase-js"
import { parseCreativeBrief, projectContextSchema, type ProjectContext } from "./domain"
import { normalizeStudioFeatureFlags } from "./feature-flags"

export async function buildProjectContext(
  supabase: SupabaseClient,
  project: Record<string, unknown> & { id: string; user_id: string },
): Promise<ProjectContext> {
  const { data: featureRow } = await supabase.from("site_settings").select("value").eq("key", "studio_features").maybeSingle()
  return projectContextSchema.parse({
    id: project.id,
    userId: project.user_id,
    name: project.name,
    description: project.description ?? null,
    productionMode: project.production_mode ?? "legacy",
    projectType: project.project_type ?? "unspecified",
    creativeBrief: parseCreativeBrief(project.creative_brief),
    defaultStyle: project.default_style ?? "photorealistic",
    defaultAspect: project.default_aspect ?? "16:9",
    featureFlags: normalizeStudioFeatureFlags(featureRow?.value),
  })
}
