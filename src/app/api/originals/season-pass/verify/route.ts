import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

/**
 * Turn a paid Razorpay order into a season pass.
 *
 * Follows the credit top-up's verification exactly, for the same reason: the
 * signature is an HMAC over `order_id|payment_id` and says nothing about who
 * paid, what for, or how much. Everything that decides entitlement is read back
 * from Razorpay — the request body carries only the three identifiers needed to
 * look the order up.
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
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = verifySchema.parse(await request.json())

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
      .digest("hex")

    // Constant time, and a length mismatch is a failure rather than something
    // timingSafeEqual should be asked to judge.
    const provided = Buffer.from(input.razorpay_signature, "utf8")
    const expectedBuf = Buffer.from(expected, "utf8")
    if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(input.razorpay_order_id),
      razorpay.payments.fetch(input.razorpay_payment_id),
    ])
    const notes = (order?.notes || {}) as Record<string, string>

    // A signature is valid for whoever holds it; without this one person's
    // payment could be replayed by another account to entitle itself.
    if (notes.profile_id !== user.id) {
      return NextResponse.json({ error: "This order belongs to another account." }, { status: 403 })
    }
    if (notes.type !== "originals_season_pass" || !notes.series_id) {
      return NextResponse.json({ error: "This order is not a season pass." }, { status: 400 })
    }
    if (payment.order_id !== input.razorpay_order_id) {
      return NextResponse.json({ error: "This payment belongs to a different order." }, { status: 400 })
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json({ error: "This payment has not completed." }, { status: 400 })
    }
    if (Number(payment.amount) !== Number(order.amount)) {
      return NextResponse.json({ error: "The amount paid does not match the order." }, { status: 400 })
    }

    const priceInr = Math.round(Number(payment.amount) / 100)
    const days = Number(notes.days) || 30

    // Idempotent on the payment id: a retried submission returns the pass it
    // already bought rather than selling a second one.
    const admin = createServiceClient()
    const { data, error } = await admin.rpc("grant_originals_season_pass", {
      p_profile_id: user.id,
      p_series_id: notes.series_id,
      p_price_inr: priceInr,
      p_payment_id: input.razorpay_payment_id,
      p_days: days,
    })
    if (error) {
      return NextResponse.json({ error: `Could not grant the pass: ${error.message}` }, { status: 500 })
    }

    const result = Array.isArray(data) ? data[0] : data
    const granted = Boolean(result?.granted)

    if (granted) {
      await admin.rpc("record_payment", {
        p_email: user.email || "",
        p_txnid: input.razorpay_payment_id,
        p_payment_id: input.razorpay_payment_id,
        p_amount: String(priceInr),
        p_product_info: `Originals Season Pass (${days} days)`,
        p_status: "success",
        p_profile_id: user.id,
      })
    }

    return NextResponse.json({
      success: true,
      granted,
      expiresAt: result?.expires_at ?? null,
      message: granted
        ? `Season pass active for ${days} days. Every episode is unlocked.`
        : "This payment was already applied to your pass.",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed" }, { status: 500 })
  }
}
