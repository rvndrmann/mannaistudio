import type { SupabaseClient } from "@supabase/supabase-js"

export type CreatorStudioAccess = {
  entitled: boolean
  purchaseWindowExpiresAt: string | null
  purchaseOnly: boolean
}

const NO_ACCESS: CreatorStudioAccess = { entitled: false, purchaseWindowExpiresAt: null, purchaseOnly: false }

/** Who may use the Creator Studio is decided in the database
 * (`creator_studio_access`, migration 20261023150000), the same rule the
 * project insert trigger applies. `supabase` must act as `userId`: the RPC only
 * answers for the signed-in caller. Any failure means no access. */
export async function getCreatorStudioAccess(supabase: SupabaseClient, userId: string): Promise<CreatorStudioAccess> {
  if (!userId) return NO_ACCESS
  const { data, error } = await supabase.rpc("my_creator_studio_access")
  if (error || !data || typeof data !== "object") return NO_ACCESS
  const row = data as { entitled?: unknown; purchase_window_expires_at?: unknown; purchase_only?: unknown }
  return {
    entitled: row.entitled === true,
    purchaseWindowExpiresAt: typeof row.purchase_window_expires_at === "string" ? row.purchase_window_expires_at : null,
    purchaseOnly: row.purchase_only === true,
  }
}

export async function hasCreatorStudioEntitlement(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getCreatorStudioAccess(supabase, userId)).entitled
}

/** A project shared with this user. Sharing is the owner's decision, so a
 * member opens the project without a subscription of their own. RLS on
 * creator_project_members shows a user only their own memberships. */
export async function isCreatorProjectMember(supabase: SupabaseClient, userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId) return false
  const { data, error } = await supabase
    .from("creator_project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("profile_id", userId)
    .maybeSingle()
  return !error && Boolean(data)
}
