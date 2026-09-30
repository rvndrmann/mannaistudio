import { NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST() {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })

    const { data: entitlement } = await supabase.from("user_entitlements")
      .select("source_id,expires_at")
      .eq("profile_id", user.id)
      .eq("entitlement_key", "creator_studio_access")
      .eq("source_type", "studio_subscription")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!entitlement?.source_id) return NextResponse.json({ error: "No Creator Studio subscription was found." }, { status: 404 })

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const subscription: any = await razorpay.subscriptions.fetch(entitlement.source_id)
    if (subscription?.notes?.profile_id !== user.id || subscription?.notes?.type !== "creator_studio_monthly") {
      return NextResponse.json({ error: "Could not verify your Creator Studio subscription." }, { status: 403 })
    }
    if (subscription.status !== "active" || subscription.cancel_at_cycle_end) {
      return NextResponse.json({ error: "This subscription cannot be cancelled again." }, { status: 409 })
    }

    const cancelled: any = await razorpay.subscriptions.cancel(subscription.id, { cancel_at_cycle_end: 1 } as any)
    const end = Number(cancelled?.current_end || subscription.current_end || 0)
    if (end) {
      const { error } = await createServiceClient().from("user_entitlements")
        .update({ expires_at: new Date(end * 1000).toISOString() })
        .eq("profile_id", user.id)
        .eq("entitlement_key", "creator_studio_access")
        .eq("source_type", "studio_subscription")
        .eq("source_id", subscription.id)
      if (error) throw error
    }

    return NextResponse.json({ success: true, cancelAtCycleEnd: true, currentPeriodEndsAt: end ? new Date(end * 1000).toISOString() : null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not cancel subscription." }, { status: 500 })
  }
}
