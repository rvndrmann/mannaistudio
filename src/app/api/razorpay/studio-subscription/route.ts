import { NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { getCreatorStudioAccess } from "@/lib/studio/entitlement"
import { applyBillingOverrides, billingTiers } from "@/lib/billing-plans"
import { createServiceClient } from "@/lib/supabase/service"

const STUDIO_MONTHLY_PLAN_ID = process.env.RAZORPAY_STUDIO_MONTHLY_PLAN_ID

export async function POST(request: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })

    const { data: billingRow } = await supabase.from("site_settings").select("value").eq("key", "billing").maybeSingle()
    const studioTier = applyBillingOverrides(billingRow?.value).plus
    const planId = STUDIO_MONTHLY_PLAN_ID || studioTier.planId
    const expectedAmountPaise = Math.round(studioTier.priceInr * 100)

    const body = await request.json().catch(() => ({})) as { renew?: boolean }
    let startAt: number | undefined
    if (body.renew) {
      const { data: previous } = await supabase.from("user_entitlements")
        .select("source_id,expires_at")
        .eq("profile_id", user.id)
        .eq("entitlement_key", "creator_studio_access")
        .eq("source_type", "studio_subscription")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!previous?.source_id) return NextResponse.json({ error: "No previous Creator Studio subscription was found." }, { status: 403 })

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
      const previousSubscription: any = await razorpay.subscriptions.fetch(previous.source_id)
      const cancelScheduled = previousSubscription?.status === "active" && Boolean(previousSubscription?.cancel_at_cycle_end)
      const ended = ["cancelled", "completed", "expired", "halted"].includes(previousSubscription?.status)
      if (!cancelScheduled && !ended) {
        return NextResponse.json({ error: "Your Creator Studio subscription is already active." }, { status: 409 })
      }
      const periodEnd = Number(previousSubscription?.current_end || 0)
      const entitlementEnd = previous.expires_at ? Math.floor(Date.parse(previous.expires_at) / 1000) : 0
      const nextStart = Math.max(periodEnd, entitlementEnd)
      if (nextStart > Math.floor(Date.now() / 1000) + 60) startAt = nextStart
    } else {
      const access = await getCreatorStudioAccess(supabase, user.id)
      if (!access.entitled || !access.purchaseOnly || !access.purchaseWindowExpiresAt) {
        return NextResponse.json({ error: "An active 24-hour Studio invitation window is required to start this offer." }, { status: 403 })
      }
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    // The user selected the existing Plus plan for this Studio-only offer.
    // Validate against its actual configured price, and do not activate Plus membership.
    const plan: any = await razorpay.plans.fetch(planId)
    if (plan?.period !== "monthly" || Number(plan?.item?.amount) !== expectedAmountPaise || plan?.item?.currency !== "INR") {
      return NextResponse.json({ error: `The selected Creator Studio plan must charge ₹${studioTier.priceInr.toLocaleString("en-IN")} every month.` }, { status: 503 })
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120,
      ...(startAt ? { start_at: startAt } : {}),
      notes: {
        type: "creator_studio_monthly",
        profile_id: user.id,
        email: user.email || "",
        credits: "3000",
        ...(body.renew ? { renewal: "true" } : {}),
      },
    } as any)

    const pendingStart = startAt ? new Date(startAt * 1000).toISOString() : "9999-12-31T00:00:00.000Z"
    const { error: entitlementError } = await createServiceClient().from("user_entitlements").upsert({
      profile_id: user.id,
      entitlement_key: "creator_studio_access",
      source_type: "studio_subscription",
      source_id: subscription.id,
      starts_at: pendingStart,
      expires_at: null,
    }, { onConflict: "profile_id,entitlement_key,source_type,source_id" })
    if (entitlementError) throw entitlementError

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
      startsAt: startAt ? new Date(startAt * 1000).toISOString() : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Studio subscription." }, { status: 500 })
  }
}
