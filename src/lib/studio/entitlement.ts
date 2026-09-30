import type { SupabaseClient } from "@supabase/supabase-js"

const STUDIO_ENTITLEMENT_SOURCES = [
  "admin",
  "admin_preview",
  "studio_subscription",
]

export type CreatorStudioAccess = {
  entitled: boolean
  purchaseWindowExpiresAt: string | null
  purchaseOnly: boolean
}

export async function getCreatorStudioAccess(supabase: SupabaseClient, userId: string): Promise<CreatorStudioAccess> {
  const [{ data: admin }, { data: grants, error }] = await Promise.all([
    supabase.from("admin_users").select("id").eq("id", userId).maybeSingle(),
    supabase.from("user_entitlements")
      .select("source_type,starts_at,expires_at")
      .eq("profile_id", userId)
      .eq("entitlement_key", "creator_studio_access")
      .in("source_type", STUDIO_ENTITLEMENT_SOURCES),
  ])

  if (admin) return { entitled: true, purchaseWindowExpiresAt: null, purchaseOnly: false }
  if (error) return { entitled: false, purchaseWindowExpiresAt: null, purchaseOnly: false }

  const now = Date.now()
  const activeGrants = (grants || []).filter((grant) => {
    const startsAt = Date.parse(grant.starts_at)
    const expiresAt = grant.expires_at ? Date.parse(grant.expires_at) : null
    return startsAt <= now && (expiresAt === null || expiresAt > now)
  })
  const isPreviewGrant = (grant: { source_type: string; expires_at: string | null }) =>
    grant.source_type === "admin_preview" || (grant.source_type === "admin" && Boolean(grant.expires_at))
  // Creator Studio is now invite-only until purchase. Do not honor legacy
  // grandfathered grants or permanent manual grants as paid access. Admins
  // can still grant a time-limited preview window, and subscriptions qualify.
  const permanent = activeGrants.some((grant) => grant.source_type === "studio_subscription")
  const previewGrants = activeGrants.filter((grant) => isPreviewGrant(grant) && grant.expires_at)
  const purchaseWindowExpiresAt = previewGrants
    .map((grant) => grant.expires_at as string)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null

  return {
    entitled: permanent || Boolean(purchaseWindowExpiresAt),
    purchaseWindowExpiresAt,
    purchaseOnly: !permanent && Boolean(purchaseWindowExpiresAt),
  }
}

export async function hasCreatorStudioEntitlement(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getCreatorStudioAccess(supabase, userId)).entitled
}
