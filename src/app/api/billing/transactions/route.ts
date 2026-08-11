import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchMyPayments } from "@/lib/membership"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [transactions, profileRes] = await Promise.all([
      fetchMyPayments(supabase, user.id),
      supabase
        .from("profiles")
        .select("membership_status, membership_expires_at, razorpay_subscription_id, created_at")
        .eq("id", user.id)
        .maybeSingle(),
    ])

    const profile = profileRes.data
    const subscription = profile?.razorpay_subscription_id || profile?.membership_status === "active"
      ? {
          active: true,
          status: profile.membership_status || "active",
          subscriptionId: profile.razorpay_subscription_id || null,
          createdAt: profile.created_at || null,
          nextBillingDate: profile.membership_expires_at || null,
        }
      : null

    return NextResponse.json({ transactions, subscription })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}
