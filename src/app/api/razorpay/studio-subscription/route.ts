import { NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { getCreatorStudioAccess } from "@/lib/studio/entitlement"
import { INR_PER_USD } from "@/lib/currency"
import { billingTiers } from "@/lib/billing-plans"
import { applyBillingOverrides } from "@/lib/billing-plans"

const STUDIO_MONTHLY_PLAN_ID = process.env.RAZORPAY_STUDIO_MONTHLY_PLAN_ID

export async function POST() {
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

    const access = await getCreatorStudioAccess(supabase, user.id)
    if (!access.entitled || !access.purchaseOnly || !access.purchaseWindowExpiresAt) {
      return NextResponse.json({ error: "An active 24-hour Studio invitation window is required to start this offer." }, { status: 403 })
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
      notes: {
        type: "creator_studio_monthly",
        profile_id: user.id,
        email: user.email || "",
        credits: "3000",
      },
    })

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Studio subscription." }, { status: 500 })
  }
}
