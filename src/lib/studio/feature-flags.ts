import type { SupabaseClient } from "@supabase/supabase-js"

export const studioFeatureFlagDefaults = {
  ai_director_text_enabled: false,
  ai_director_tools_enabled: false,
  production_modes_enabled: false,
  generation_jobs_enabled: false,
  voice_director_enabled: false,
  series_hierarchy_enabled: false,
  continuity_checks_enabled: false,
  auto_model_routing_enabled: false,
  studio_export_enabled: false,
} as const

export type StudioFeatureFlag = keyof typeof studioFeatureFlagDefaults
export type StudioFeatureFlags = Record<StudioFeatureFlag, boolean>

export function normalizeStudioFeatureFlags(value: unknown): StudioFeatureFlags {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(studioFeatureFlagDefaults).map(([key, fallback]) => [key, typeof source[key] === "boolean" ? source[key] : fallback]),
  ) as StudioFeatureFlags
}

export async function fetchStudioFeatureFlags(supabase: SupabaseClient): Promise<StudioFeatureFlags> {
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", "studio_features").maybeSingle()
  const flags = error ? { ...studioFeatureFlagDefaults } : normalizeStudioFeatureFlags(data?.value)
  if (process.env.NODE_ENV === "development" && process.env.STUDIO_LOCAL_PREVIEW === "true") {
    return {
      ...flags,
      ai_director_text_enabled: true,
      generation_jobs_enabled: true,
      voice_director_enabled: true,
      production_modes_enabled: true,
      series_hierarchy_enabled: true,
      continuity_checks_enabled: true,
    }
  }
  return flags
}
