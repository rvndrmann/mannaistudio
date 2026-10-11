import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import { isPaidAccessPeriod } from "@/lib/all-access-plan"

/** Read with the service role: a browser must never control the billing policy.
 * Existing/expired subscriptions keep the restriction, including old queued jobs.
 * Errors propagate: uncertainty must never authorize platform spending.
 */
export async function getByokSubscriptionPolicy(userId: string) {
  const client = createServiceClient()
  const [{ data, error }, { data: testAccess, error: testAccessError }, { data: grants, error: grantsError }] = await Promise.all([
    client.from("all_access_subscriptions")
      .select("paid_until").eq("profile_id", userId).not("paid_until", "is", null),
    client.from("site_settings").select("value").eq("key", "byok_test_access").maybeSingle(),
    client.from("user_entitlements").select("source_type,starts_at,expires_at")
      .eq("profile_id", userId).eq("entitlement_key", "creator_studio_access")
      .in("source_type", ["admin", "admin_preview"]),
  ])
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("To use AI chat, images, and videos, subscribe to All Access and connect your own API keys. Subscription activation is currently unavailable; please try again later.")
    }
    throw error
  }
  if (testAccessError) throw testAccessError
  if (grantsError) throw grantsError
  const now = Date.now()
  // Explicit admin grants may be indefinite; previews must have an expiry.
  // Legacy invitations are excluded by the source filter above.
  const grantActive = (grants || []).some(row => {
    const start = Date.parse(row.starts_at)
    const end = Date.parse(row.expires_at)
    return Number.isFinite(start) && start <= now && (
      row.source_type === "admin" && row.expires_at === null
      || Number.isFinite(end) && end > now
    )
  })
  const testUserIds = (testAccess?.value as { userIds?: unknown } | null)?.userIds
  const testGranted = Array.isArray(testUserIds) && testUserIds.includes(userId)
  const required = Boolean(data?.length) || Boolean(grants?.length) || testGranted
  return { required, active: grantActive || testGranted || (data || []).some(row => isPaidAccessPeriod(row)) }
}
