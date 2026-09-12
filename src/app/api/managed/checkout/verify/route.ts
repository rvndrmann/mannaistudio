import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createServiceClient } from "@/lib/supabase/service"
import { managedErrorMessage, managedErrorStatus, requireUser } from "@/lib/managed/server"
import { serviceName } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * Turns a paid Razorpay order into a live production.
 *
 * Follows the season pass verification exactly, for the same reason: the
 * signature is an HMAC over `order_id|payment_id` and says nothing about who
 * paid, what for, or how much. Everything that decides entitlement is read back
 * from Razorpay — which project, whose, at what price — and the body carries
 * only the three identifiers needed to look the order up.
 */

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(200),
  razorpay_payment_id: z.string().min(1).max(200),
  razorpay_signature: z.string().min(1).max(500),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    const keyId = process.env.RAZORPAY_KEY_ID
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 })
    }

    const { user } = await requireUser()
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
    // payment could be replayed by another account to open their project.
    if (notes.profile_id !== user.id) {
      return NextResponse.json({ error: "This order belongs to another account." }, { status: 403 })
    }
    if (notes.type !== "managed_production" || !notes.managed_project_id) {
      return NextResponse.json({ error: "This order is not a managed production." }, { status: 400 })
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
    const admin = createServiceClient()

    // Belt and braces on top of the notes: the project has to belong to the
    // account that is verifying, not merely to the id written in the order.
    const { data: project } = await admin
      .from("managed_projects")
      .select("id,user_id,name,service_type")
      .eq("id", notes.managed_project_id)
      .maybeSingle()
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "That project could not be found on your account." }, { status: 404 })
    }

    const { data, error } = await admin.rpc("mark_managed_project_paid", {
      p_project_id: project.id,
      p_payment_id: input.razorpay_payment_id,
      p_price_inr: priceInr,
    })
    if (error) {
      return NextResponse.json({ error: `Could not confirm the order: ${error.message}` }, { status: 500 })
    }

    const result = Array.isArray(data) ? data[0] : data
    const granted = Boolean(result?.granted)

    if (granted) {
      await admin.rpc("record_payment", {
        p_email: user.email || "",
        p_txnid: input.razorpay_payment_id,
        p_payment_id: input.razorpay_payment_id,
        p_amount: String(priceInr),
        p_product_info: `${serviceName(project.service_type)} — ${project.name}`,
        p_status: "success",
        p_profile_id: user.id,
      })
    }

    return NextResponse.json({
      success: true,
      granted,
      projectId: project.id,
      message: granted
        ? "Your project is confirmed. The creative team has your brief."
        : "This payment was already applied to your project.",
    })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Verification failed") },
      { status: managedErrorStatus(error) },
    )
  }
}
