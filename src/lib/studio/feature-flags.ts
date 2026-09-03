import type { SupabaseClient } from "@supabase/supabase-js"

export const studioFeatureFlagDefaults = {
  production_modes_enabled: true,
  agent_proposals_enabled: true,
  multi_shot_timeline_enabled: true,
  asset_consistency_v2: true,
  script_assistant_v2: true,
  ai_director_tools_enabled: true,
  series_hierarchy_enabled: true,
  continuity_checks_enabled: true,
  generation_jobs_enabled: true,
} as const

export type StudioFeatureFlags = Record<keyof typeof studioFeatureFlagDefaults, boolean>

export function normalizeStudioFeatureFlags(input: unknown): StudioFeatureFlags {
  const flags = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  return {
    production_modes_enabled: typeof flags.production_modes_enabled === "boolean" ? flags.production_modes_enabled : studioFeatureFlagDefaults.production_modes_enabled,
    agent_proposals_enabled: typeof flags.agent_proposals_enabled === "boolean" ? flags.agent_proposals_enabled : studioFeatureFlagDefaults.agent_proposals_enabled,
    multi_shot_timeline_enabled: typeof flags.multi_shot_timeline_enabled === "boolean" ? flags.multi_shot_timeline_enabled : studioFeatureFlagDefaults.multi_shot_timeline_enabled,
    asset_consistency_v2: typeof flags.asset_consistency_v2 === "boolean" ? flags.asset_consistency_v2 : studioFeatureFlagDefaults.asset_consistency_v2,
    script_assistant_v2: typeof flags.script_assistant_v2 === "boolean" ? flags.script_assistant_v2 : studioFeatureFlagDefaults.script_assistant_v2,
    ai_director_tools_enabled: typeof flags.ai_director_tools_enabled === "boolean" ? flags.ai_director_tools_enabled : studioFeatureFlagDefaults.ai_director_tools_enabled,
    series_hierarchy_enabled: typeof flags.series_hierarchy_enabled === "boolean" ? flags.series_hierarchy_enabled : studioFeatureFlagDefaults.series_hierarchy_enabled,
    continuity_checks_enabled: typeof flags.continuity_checks_enabled === "boolean" ? flags.continuity_checks_enabled : studioFeatureFlagDefaults.continuity_checks_enabled,
    generation_jobs_enabled: typeof flags.generation_jobs_enabled === "boolean" ? flags.generation_jobs_enabled : studioFeatureFlagDefaults.generation_jobs_enabled,
  }
}

export async function fetchStudioFeatureFlags(supabase: SupabaseClient): Promise<StudioFeatureFlags> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "studio_features").maybeSingle()
  return normalizeStudioFeatureFlags(data?.value)
}

export interface FeatureFlags {
  socialPublishing: {
    instagram: boolean
    facebook: boolean
    x: boolean
    linkedin: boolean
  }
  socialAnalytics: {
    instagram: boolean
    facebook: boolean
    x: boolean
    linkedin: boolean
  }
  adsManager: {
    metaAds: boolean
    linkedinAds: boolean
    xAds: boolean
  }
  competitorIntelligence: boolean
  marketingAutopilot: boolean
  aiAdAgent: boolean
}

export const defaultFeatureFlags: FeatureFlags = {
  socialPublishing: {
    instagram: false,
    facebook: false,
    x: false,
    linkedin: false,
  },
  socialAnalytics: {
    instagram: false,
    facebook: false,
    x: false,
    linkedin: false,
  },
  adsManager: {
    metaAds: false,
    linkedinAds: false,
    xAds: false,
  },
  competitorIntelligence: false,
  marketingAutopilot: false,
  aiAdAgent: false,
}

export function getFeatureFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return defaultFeatureFlags[key]
}

export type SiteFeatures = {
  calendar: boolean
  analytics: boolean
  ads: boolean
  competitors: boolean
  social: boolean
  courses: boolean
  blog: boolean
  mcp: boolean
  originals: boolean
}

export const defaultSiteFeatures: SiteFeatures = {
  calendar: true,
  analytics: true,
  ads: true,
  competitors: true,
  social: true,
  courses: true,
  blog: true,
  mcp: true,
  originals: true,
}

export async function fetchSiteFeatures(supabase: SupabaseClient): Promise<SiteFeatures> {
  try {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "site_features").maybeSingle()
    if (!data?.value) return defaultSiteFeatures
    return {
      calendar: data.value.calendar !== false,
      analytics: data.value.analytics !== false,
      ads: data.value.ads !== false,
      competitors: data.value.competitors !== false,
      social: data.value.social !== false,
      courses: data.value.courses !== false,
      blog: data.value.blog !== false,
      mcp: data.value.mcp !== false,
      originals: data.value.originals !== false,
    }
  } catch {
    return defaultSiteFeatures
  }
}
