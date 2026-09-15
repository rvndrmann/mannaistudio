import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Which landing page `/` serves.
 *
 * Three homepages exist so an offer can be tried against the others without
 * maintaining a second domain. Only one is live at a time — the admin switches
 * it — so a run of any of them is a clean stretch of traffic rather than a
 * split that has to be untangled afterwards.
 *
 *   studio    — the existing pitch: AI Director, models, Creator Studio
 *   originals — the short-drama funnel, with no mention of the studio at all
 *   hire      — the done-for-you offer: send a brief, receive finished ads
 */
export type HomeVariant = "studio" | "originals" | "hire"

export const defaultHomeVariant: HomeVariant = "studio"

/**
 * The switch, described once.
 *
 * The admin panel used to hold its own copy of this list, so adding a homepage
 * meant editing the type here and the buttons there, and a variant that existed
 * in one and not the other was a page nobody could reach.
 */
export const homeVariants: Array<{
  id: HomeVariant
  label: string
  description: string
  /** What the admin is told after switching to it. */
  confirmation: string
}> = [
  {
    id: "studio",
    label: "Creator Studio pitch",
    description: "AI Director agent, frontier models, showcase reel, Creator Studio call to action. For visitors who want to make the videos themselves.",
    confirmation: "Homepage now shows the Creator Studio pitch.",
  },
  {
    id: "originals",
    label: "Originals",
    description: "Short-drama funnel: featured series, poster grid, free episodes, credit packs. Does not mention Creator Studio at all.",
    confirmation: "Homepage now shows Originals.",
  },
  {
    id: "hire",
    label: "Done-for-you ads",
    description: "The Hire Our Creative Team offer as the front door: send a brief, first cut in 24 hours, two revisions, finished files. Sells the service, never the software.",
    confirmation: "Homepage now sells the done-for-you service.",
  },
]

const knownVariants = new Set(homeVariants.map((variant) => variant.id))

export function isHomeVariant(value: unknown): value is HomeVariant {
  return typeof value === "string" && knownVariants.has(value as HomeVariant)
}

export function normalizeHomeVariant(value: unknown): HomeVariant {
  return isHomeVariant(value) ? value : defaultHomeVariant
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
