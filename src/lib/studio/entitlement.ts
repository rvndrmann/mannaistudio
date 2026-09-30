import type { SupabaseClient } from "@supabase/supabase-js"

const STUDIO_ENTITLEMENT_SOURCES = [
  "admin",
  "admin_preview",
  "coaching_purchase",
  "coaching_inclusion",
  "course_purchase",
  "course_inclusion",
  "product_purchase",
  "free_product",
  "credit_purchase",
  "studio_subscription",
  "legacy_access",
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
  const permanent = activeGrants.some((grant) => !isPreviewGrant(grant))
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
