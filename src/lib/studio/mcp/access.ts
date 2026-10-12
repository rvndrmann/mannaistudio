import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"
import { isAdminUser } from "@/lib/membership"

/**
 * Whether assistant connections are open to this account.
 *
 * Paused in Admin means closed to customers, not closed to everyone: an admin
 * still gets through, which is the only way to try the whole flow — consent,
 * token, tool calls — against the real site before anyone else is offered it.
 */
export async function mcpOpenFor(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if ((await fetchSiteFeatures(supabase)).mcp) return true
  return isAdminUser(supabase, userId).catch(() => false)
}
