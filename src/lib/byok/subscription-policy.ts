import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import { isPaidAccessPeriod } from "@/lib/all-access-plan"

/** Read with the service role: a browser must never control the billing policy.
 * Existing/expired subscriptions keep the restriction, including old queued jobs.
 * Errors propagate: uncertainty must never authorize platform spending.
 */
export async function getByokSubscriptionPolicy(userId: string) {
  const { data, error } = await createServiceClient().from("all_access_subscriptions")
    .select("paid_until").eq("profile_id", userId).not("paid_until", "is", null)
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("To use AI chat, images, and videos, subscribe to All Access and connect your own API keys. Subscription activation is currently unavailable; please try again later.")
    }
    throw error
  }
  return { required: Boolean(data?.length), active: (data || []).some(row => isPaidAccessPeriod(row)) }
}
