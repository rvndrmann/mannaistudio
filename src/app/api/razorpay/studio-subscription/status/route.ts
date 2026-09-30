import { NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })

    const { data: entitlement } = await supabase.from("user_entitlements")
      .select("source_id,starts_at,expires_at,created_at")
      .eq("profile_id", user.id)
      .eq("entitlement_key", "creator_studio_access")
      .eq("source_type", "studio_subscription")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!entitlement?.source_id) return NextResponse.json({ subscribed: false, active: false, canRenew: false })

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 })

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const subscription: any = await razorpay.subscriptions.fetch(entitlement.source_id)
    if (subscription?.notes?.profile_id !== user.id || subscription?.notes?.type !== "creator_studio_monthly") {
      return NextResponse.json({ error: "Could not verify your Creator Studio subscription." }, { status: 403 })
    }

    const periodEnd = Number(subscription.current_end || 0)
    const expiresAt = entitlement.expires_at || (periodEnd ? new Date(periodEnd * 1000).toISOString() : null)
    const effectiveNow = Date.parse(entitlement.starts_at) <= Date.now() && (!expiresAt || Date.parse(expiresAt) > Date.now())
    const cancelAtCycleEnd = Boolean(subscription.cancel_at_cycle_end)
    const terminal = ["cancelled", "completed", "expired", "halted"].includes(subscription.status)
    return NextResponse.json({
      subscribed: true,
      active: (subscription.status === "active" || terminal) && effectiveNow,
      pending: ["created", "authenticated"].includes(subscription.status),
      status: subscription.status,
      cancelAtCycleEnd,
      currentPeriodEndsAt: expiresAt,
      subscriptionId: subscription.id,
      canRenew: (terminal || cancelAtCycleEnd) && !(["created", "authenticated"].includes(subscription.status)),
      renewalScheduledFor: cancelAtCycleEnd && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load subscription status." }, { status: 500 })
  }
}
