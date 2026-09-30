import { NextRequest, NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { INR_PER_USD } from "@/lib/currency"
import { getCreatorStudioAccess } from "@/lib/studio/entitlement"

const PACKAGE_PRICE_USD = 30
const PACKAGE_CREDITS = 3000
const PACKAGE_PRICE_INR = Math.ceil(PACKAGE_PRICE_USD * INR_PER_USD)

export async function POST(_request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })

    const studioAccess = await getCreatorStudioAccess(supabase, user.id)
    if (!studioAccess.entitled || !studioAccess.purchaseOnly || !studioAccess.purchaseWindowExpiresAt) {
      return NextResponse.json({ error: "An active 24-hour Studio access window is required to buy this package." }, { status: 403 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount: PACKAGE_PRICE_INR * 100,
      currency: "INR",
      receipt: `course_credits_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "credits",
        profile_id: user.id,
        credits: String(PACKAGE_CREDITS),
        packageId: "studio-window-3000",
        package_amount_paise: String(PACKAGE_PRICE_INR * 100),
        purchase_deadline: studioAccess.purchaseWindowExpiresAt,
        email: user.email || "",
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      priceInr: PACKAGE_PRICE_INR,
      credits: PACKAGE_CREDITS,
      keyId,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout." }, { status: 500 })
  }
}
