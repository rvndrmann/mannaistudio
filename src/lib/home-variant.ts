import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Which landing page `/` serves.
 *
 * Two homepages exist so the Originals funnel can be tried against the studio
 * pitch without maintaining a second domain. Only one is live at a time — the
 * admin switches it — so a run of either is a clean stretch of traffic rather
 * than a split that has to be untangled afterwards.
 *
 *   studio    — the existing pitch: AI Director, models, Creator Studio
 *   originals — the short-drama funnel, with no mention of the studio at all
 */
export type HomeVariant = "studio" | "originals"

export const defaultHomeVariant: HomeVariant = "studio"

export function normalizeHomeVariant(value: unknown): HomeVariant {
  return value === "originals" ? "originals" : defaultHomeVariant
}

export async function fetchHomeVariant(supabase: SupabaseClient): Promise<HomeVariant> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "home_variant")
      .maybeSingle()
    return normalizeHomeVariant((data?.value as { variant?: unknown } | null)?.variant)
  } catch {
    // A settings read that fails must not take the landing page down with it.
    return defaultHomeVariant
  }
}
