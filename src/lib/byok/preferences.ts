import "server-only"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * "Only my own keys."
 *
 * With it on the studio never spends a credit on this user's behalf: a provider
 * they have not connected is refused rather than billed. It is the setting for
 * someone who wants the workspace and nothing else — their accounts pay for
 * every generation that runs.
 *
 * Stored on the existing preferences row rather than a table of its own, since
 * it is one boolean about a user and that is what the row is for.
 */

const OWN_KEYS_ONLY = "byok_own_keys_only"

export async function ownKeysOnly(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("creator_user_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  const preferences = (data?.preferences as Record<string, unknown>) || {}
  return preferences[OWN_KEYS_ONLY] === true
}

export async function setOwnKeysOnly(userId: string, value: boolean): Promise<void> {
  const client = createServiceClient()
  const { data } = await client
    .from("creator_user_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle()
  // Merged rather than replaced: the row holds everything else the user has
  // set, and writing one key over the whole object would erase the rest.
  const preferences = { ...((data?.preferences as Record<string, unknown>) || {}), [OWN_KEYS_ONLY]: value }
  const { error } = await client
    .from("creator_user_preferences")
    .upsert({ user_id: userId, preferences, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw error
}
