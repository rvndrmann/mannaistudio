import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Turn a paid Razorpay order into credits.
 *
 * The signature proves that Razorpay saw this payment against this order. It
 * does not say how much was paid — it is an HMAC over `order_id|payment_id` and
 * nothing else. This route used to take the amount from the request body, so a
 * genuine ₹1,000 payment could be re-submitted as ten million credits with its
 * own valid signature, and re-submitted again for more.
 *
 * Everything that decides value is now read back from Razorpay: the order says
 * what it was for, what it cost, and whose it was. The request body carries only
 * the three identifiers needed to look it up.
 */

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(200),
  razorpay_payment_id: z.string().min(1).max(200),
  razorpay_signature: z.string().min(1).max(500),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = verifySchema.parse(await request.json())

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
      .digest("hex")

    // Compared over constant time so the check cannot be narrowed by timing.
    // Both sides are hex of a fixed length, so a length mismatch is already a
    // failure rather than something timingSafeEqual should be asked to judge.
    const provided = Buffer.from(input.razorpay_signature, "utf8")
    const expected = Buffer.from(expectedSignature, "utf8")
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

    // What was bought, and what was actually paid — both read from Razorpay.
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(input.razorpay_order_id),
      razorpay.payments.fetch(input.razorpay_payment_id),
    ])
    const notes = (order?.notes || {}) as Record<string, string>

    // A signature is valid for whoever holds it. Without this, one person's
    // completed payment could be replayed by another account to credit itself.
    if (notes.profile_id !== user.id) {
      return NextResponse.json({ error: "This order belongs to another account." }, { status: 403 })
    }
    if (notes.type !== "credits") {
      return NextResponse.json({ error: "This order is not a credit purchase." }, { status: 400 })
    }

    // Money is judged on the payment, not on the order. The order aggregate can
    // still read `attempted` for a moment after checkout returns, and failing a
    // genuine purchase on that race would be worse than the delay it saves.
    if (payment.order_id !== input.razorpay_order_id) {
      return NextResponse.json({ error: "This payment belongs to a different order." }, { status: 400 })
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json({ error: "This payment has not completed." }, { status: 400 })
    }

    // The order was created server-side in POST /api/credits, where credits and
    // price were derived together. Reading both back keeps them consistent even
    // if the rate card changes between checkout and verification.
    const credits = Number(notes.credits)
    if (!Number.isInteger(credits) || credits <= 0) {
      return NextResponse.json({ error: "This order has no credit amount recorded." }, { status: 400 })
    }

    // Charge what was collected, not what the order asked for.
    if (Number(payment.amount) !== Number(order.amount)) {
      return NextResponse.json({ error: "The amount paid does not match the order." }, { status: 400 })
    }
    const priceInr = Math.round(Number(payment.amount) / 100)

    // The ledger writes need the service role: these functions are no longer
    // reachable by the anon or authenticated roles.
    const admin = createServiceClient()

    // Idempotent on the payment id, so a retried or replayed submission of the
    // same payment returns the balance rather than adding to it again.
    const { data, error } = await admin.rpc("grant_purchased_credits", {
      p_profile_id: user.id,
      p_amount: credits,
      p_payment_id: input.razorpay_payment_id,
      p_description: `Credit Purchase: ${credits.toLocaleString()} Credits (₹${priceInr.toLocaleString()})`,
    })
    if (error) {
      return NextResponse.json({ error: `Could not add credits: ${error.message}` }, { status: 500 })
    }

    const result = Array.isArray(data) ? data[0] : data
    const granted = Boolean(result?.granted)
    const newBalance = Number(result?.new_balance ?? 0)

    if (granted) {
      await admin.rpc("record_payment", {
        p_email: user.email || "",
        p_txnid: input.razorpay_payment_id,
        p_payment_id: input.razorpay_payment_id,
        p_amount: String(priceInr),
        p_product_info: `Credits: ${credits.toLocaleString()}`,
        p_status: "success",
        p_profile_id: user.id,
      })
    }

    return NextResponse.json({
      success: true,
      addedCredits: granted ? credits : 0,
      newBalance,
      message: granted
        ? `Payment successful! Added ${credits.toLocaleString()} credits to your account.`
        : "This payment was already credited to your account.",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed" }, { status: 500 })
  }
}
