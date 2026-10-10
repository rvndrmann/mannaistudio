import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import { isPaidAccessPeriod } from "@/lib/all-access-plan"

/** Read with the service role: a browser must never control the billing policy.
 * Existing/expired subscriptions keep the restriction, including old queued jobs.
 * Errors propagate: uncertainty must never authorize platform spending.
 */
export async function getByokSubscriptionPolicy(userId: string) {
  const client = createServiceClient()
  const [{ data, error }, { data: testAccess, error: testAccessError }] = await Promise.all([
    client.from("all_access_subscriptions")
      .select("paid_until").eq("profile_id", userId).not("paid_until", "is", null),
    client.from("site_settings").select("value").eq("key", "byok_test_access").maybeSingle(),
  ])
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("To use AI chat, images, and videos, subscribe to All Access and connect your own API keys. Subscription activation is currently unavailable; please try again later.")
    }
    throw error
  }
  if (testAccessError) throw testAccessError
  const testUserIds = (testAccess?.value as { userIds?: unknown } | null)?.userIds
  const testGranted = Array.isArray(testUserIds) && testUserIds.includes(userId)
  const required = Boolean(data?.length) || testGranted
  return { required, active: testGranted || (data || []).some(row => isPaidAccessPeriod(row)) }
}
