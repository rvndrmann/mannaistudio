import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { getUserCredits } from "@/lib/studio/credits"
import { isAdminUser, isMembershipActive } from "@/lib/membership"
import { CREDIT_PACKAGES } from "@/lib/credits-packages"

const topUpSchema = z.object({
  packageId: z.string().optional(),
  amountInr: z.number().optional(),
}).refine((data) => (data.amountInr && data.amountInr >= 1000) || (data.packageId && CREDIT_PACKAGES[data.packageId]), {
  message: "Minimum purchase is ₹1,000 (1,000 credits).",
})

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const credits = await getUserCredits(user.id, supabase)
    const { data: profile } = await supabase.from("profiles").select("membership_status, membership_expires_at").eq("id", user.id).maybeSingle()
    const isAdmin = await isAdminUser(supabase, user.id)
    const activeMember = isAdmin || isMembershipActive(profile)

    return NextResponse.json({ credits, userId: user.id, isMember: activeMember })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const input = topUpSchema.parse(body)

    let priceInr = 1000
    let credits = 1000
    let packageId = input.packageId || "custom"

    if (input.amountInr && input.amountInr >= 1000) {
      priceInr = Math.floor(input.amountInr)
      credits = priceInr
    } else if (input.packageId && CREDIT_PACKAGES[input.packageId]) {
      priceInr = CREDIT_PACKAGES[input.packageId].priceInr
      credits = CREDIT_PACKAGES[input.packageId].credits
    }

    const amountInPaise = priceInr * 100
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `credits_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "credits",
        profile_id: user.id,
        credits: String(credits),
        packageId,
        email: user.email || "",
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: amountInPaise,
      priceInr,
      keyId,
      credits,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Minimum purchase is ₹1,000 (1,000 credits)." }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order creation failed" }, { status: 500 })
  }
}
