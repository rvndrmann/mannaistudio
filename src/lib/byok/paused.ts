import { createClient } from "@/lib/supabase/server"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"

/**
 * Whether bring-your-own-keys is switched off in the admin Pause Features panel.
 *
 * Read on the server for every BYOK route, not just hidden in the UI: an offer
 * that is only hidden is still an offer to anyone who kept the URL, and this one
 * takes a customer's provider secret when it is used.
 *
 * A failure to read the flag leaves the feature on. The flag is a pause switch,
 * not a security boundary — subscription and vault checks are what protect the
 * route — and a flaky settings read should not take a working feature away from
 * everyone who paid for it.
 */
export async function byokPaused(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const features = await fetchSiteFeatures(supabase)
    return !features.byok
  } catch {
    return false
  }
}

export const BYOK_PAUSED_MESSAGE =
  "Bringing your own API keys is paused right now. Your saved keys are untouched — generations run on studio credits until it is switched back on."
