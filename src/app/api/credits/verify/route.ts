import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { addUserCredits } from "@/lib/studio/credits"
import { CREDIT_PACKAGES } from "@/lib/credits-packages"

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  packageId: z.string().optional(),
  amountInr: z.number().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const input = verifySchema.parse(body)

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
      .digest("hex")

    if (expectedSignature !== input.razorpay_signature) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 })
    }

    let priceInr = 1000
    let credits = 1000

    if (input.amountInr && input.amountInr >= 1000) {
      priceInr = Math.floor(input.amountInr)
      credits = priceInr
    } else if (input.packageId && CREDIT_PACKAGES[input.packageId]) {
      priceInr = CREDIT_PACKAGES[input.packageId].priceInr
      credits = CREDIT_PACKAGES[input.packageId].credits
    }

    // Add credits to user profile
    const newBalance = await addUserCredits(
      user.id,
      credits,
      "purchase",
      `Credit Purchase: ${credits.toLocaleString()} Credits (₹${priceInr.toLocaleString()})`,
      supabase,
    )

    // Record payment log in Supabase
    await supabase.rpc("record_payment", {
      p_email: user.email || "",
      p_txnid: input.razorpay_payment_id,
      p_payment_id: input.razorpay_payment_id,
      p_amount: String(priceInr),
      p_product_info: `Credits: ${credits.toLocaleString()}`,
      p_status: "success",
      p_profile_id: user.id,
    })

    return NextResponse.json({
      success: true,
      addedCredits: credits,
      newBalance,
      message: `Payment successful! Added ${credits.toLocaleString()} credits to your account.`,
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed" }, { status: 500 })
  }
}
