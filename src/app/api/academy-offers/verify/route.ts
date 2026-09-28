import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

const schema = z.object({
  razorpay_order_id: z.string().min(1).max(200),
  razorpay_payment_id: z.string().min(1).max(200),
  razorpay_signature: z.string().min(1).max(500),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = schema.parse(await request.json())
    const expected = crypto.createHmac("sha256", keySecret).update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest("hex")
    const providedBytes = Buffer.from(input.razorpay_signature)
    const expectedBytes = Buffer.from(expected)
    if (providedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(providedBytes, expectedBytes)) {
      return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(input.razorpay_order_id),
      razorpay.payments.fetch(input.razorpay_payment_id),
    ])
    const notes = (order.notes || {}) as Record<string, string>
    if (notes.type !== "coaching" || notes.profile_id !== user.id) return NextResponse.json({ error: "This order does not belong to your account." }, { status: 403 })
    if (payment.order_id !== input.razorpay_order_id || !["captured", "authorized"].includes(payment.status || "") || Number(payment.amount) !== Number(order.amount)) {
      return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 })
    }

    const admin = createServiceClient()
    const { data: offer } = await admin.from("academy_offers")
      .select("id,title,active,grants_creator_studio,creator_studio_access_days")
      .eq("id", notes.offer_id).maybeSingle()
    if (!offer || !offer.active) return NextResponse.json({ error: "This coaching offer is no longer available." }, { status: 409 })

    const amount = Number(payment.amount) / 100
    const { error: purchaseError } = await admin.rpc("complete_academy_coaching_reservation", {
      p_order_id: input.razorpay_order_id,
      p_payment_id: input.razorpay_payment_id,
      p_amount: amount,
    })
    if (purchaseError) return NextResponse.json({ error: `Payment verified but the order record failed: ${purchaseError.message}` }, { status: 500 })

    const { error: courseAccessError } = await admin.from("user_entitlements").upsert({
      profile_id: user.id,
      entitlement_key: "academy_all_courses",
      source_type: "coaching_purchase",
      source_id: input.razorpay_payment_id,
      expires_at: null,
    }, { onConflict: "profile_id,entitlement_key,source_type,source_id" })
    if (courseAccessError) return NextResponse.json({ error: `Payment recorded, but course access needs a retry: ${courseAccessError.message}` }, { status: 500 })

    if (offer.grants_creator_studio) {
      const days = Number(offer.creator_studio_access_days) || null
      await admin.from("user_entitlements").upsert({
        profile_id: user.id,
        entitlement_key: "creator_studio_access",
        source_type: "coaching_purchase",
        source_id: input.razorpay_payment_id,
        expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
      }, { onConflict: "profile_id,entitlement_key,source_type,source_id" })
    }

    const { data: included } = await admin.from("digital_products")
      .select("id,access_days,grants_creator_studio").eq("active", true).eq("included_with_coaching", true)
    for (const product of included || []) {
      const days = Number(product.access_days) || null
      const expires_at = days ? new Date(Date.now() + days * 86400000).toISOString() : null
      await admin.from("user_entitlements").upsert({
        profile_id: user.id,
        entitlement_key: `digital_product:${product.id}`,
        source_type: "coaching_inclusion",
        source_id: input.razorpay_payment_id,
        expires_at,
      }, { onConflict: "profile_id,entitlement_key,source_type,source_id" })
      if (product.grants_creator_studio) await admin.from("user_entitlements").upsert({
        profile_id: user.id,
        entitlement_key: "creator_studio_access",
        source_type: "coaching_inclusion",
        source_id: input.razorpay_payment_id,
        expires_at,
      }, { onConflict: "profile_id,entitlement_key,source_type,source_id" })
    }

    await admin.rpc("record_payment", {
      p_email: user.email || "",
      p_txnid: input.razorpay_payment_id,
      p_payment_id: input.razorpay_payment_id,
      p_amount: String(amount),
      p_product_info: `Coaching: ${offer.title}`,
      p_status: "success",
      p_profile_id: user.id,
    })
    return NextResponse.json({ success: true, message: "Payment successful. You now have access to all courses. Our team will contact you shortly to schedule your coaching sessions. Please add your phone number in My Account so we can reach you." })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid payment verification details." }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification failed." }, { status: 500 })
  }
}
