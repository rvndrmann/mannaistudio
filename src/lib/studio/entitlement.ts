import type { SupabaseClient } from "@supabase/supabase-js"

export async function hasCreatorStudioEntitlement(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const [{ data: admin }, { data: grants, error }] = await Promise.all([
    supabase.from("admin_users").select("id").eq("id", userId).maybeSingle(),
    supabase.from("user_entitlements").select("starts_at,expires_at").eq("profile_id", userId).eq("entitlement_key", "creator_studio_access"),
  ])
  if (admin) return true
  // Until the additive migration is applied, retain the existing signed-in
  // Studio behavior rather than locking out the whole user base.
  if (error) return true
  const now = Date.now()
  return (grants || []).some((grant) => Date.parse(grant.starts_at) <= now && (!grant.expires_at || Date.parse(grant.expires_at) > now))
}
