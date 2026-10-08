import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { allAccessGateway, reconcileAllAccess } from "@/lib/all-access-server"
import { isPaidAccessPeriod } from "@/lib/all-access-plan"

const schema = z.object({ razorpay_payment_id: z.string().min(1), razorpay_subscription_id: z.string().min(1), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) })
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const input = schema.safeParse(await request.json())
    if (!input.success) return NextResponse.json({ error: "Invalid payment verification." }, { status: 400 })
    const { data: row, error } = await supabase.from("all_access_subscriptions").select("id,paid_until")
      .eq("profile_id", user.id).eq("id", input.data.razorpay_subscription_id).maybeSingle()
    if (error || !row) return NextResponse.json({ error: "Subscription not found." }, { status: 404 })
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) throw new Error("Payment verification is not configured.")
    const expected = createHmac("sha256", secret).update(`${input.data.razorpay_payment_id}|${row.id}`).digest()
    if (!timingSafeEqual(expected, Buffer.from(input.data.razorpay_signature, "hex"))) return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 })
    // Checkout may only authorize a mandate. Only subscription.charged grants a
    // paid period, so an authorization payment never buys a free month here.
    await allAccessGateway().payments.fetch(input.data.razorpay_payment_id)
    await reconcileAllAccess(row.id)
    const { data: updated } = await supabase.from("all_access_subscriptions").select("paid_until").eq("id", row.id).single()
    return NextResponse.json({ verified: true, active: isPaidAccessPeriod(updated) })
  } catch {
    return NextResponse.json({ error: "Could not verify payment. Access will update when the payment webhook arrives." }, { status: 500 })
  }
}
