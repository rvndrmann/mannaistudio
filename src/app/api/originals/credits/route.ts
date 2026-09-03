import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { ORIGINALS_CREDIT_PACKAGES } from "@/lib/originals"
import { sendCapiEvent } from "@/lib/meta-capi"

export const dynamic = "force-dynamic"

/**
 * Buy a viewer credit pack.
 *
 * Separate from `POST /api/credits` for one reason: that route requires an
 * active subscription, because studio top-ups are sold to people already paying
 * to generate. A viewer buying twenty credits' worth of episodes is not a
 * subscriber and should not be asked to become one at the point of unlocking
 * episode four.
 *
 * What it does not relax is where the numbers come from. The pack id indexes a
 * fixed server-side table; the request carries no amount. Verification is the
 * existing `/api/credits/verify`, which reads the credit figure back off the
 * Razorpay order and grants it once per payment id.
 */

const packSchema = z.object({
  packageId: z.string(),
}).strict().refine((data) => Boolean(ORIGINALS_CREDIT_PACKAGES[data.packageId]), {
  message: "Unknown credit pack.",
})

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: "Sign in to buy credits." }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (body === null) {
      return NextResponse.json({ error: "A credit pack is required." }, { status: 400 })
    }
    const input = packSchema.parse(body)
    const pack = ORIGINALS_CREDIT_PACKAGES[input.packageId]

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount: pack.priceInr * 100,
      currency: "INR",
      receipt: `orig_${user.id.slice(0, 8)}_${Date.now()}`,
      // `type: "credits"` is what lets /api/credits/verify handle this order —
      // the grant is the same grant, only the ladder of pack sizes differs.
      notes: {
        type: "credits",
        profile_id: user.id,
        credits: String(pack.credits),
        packageId: `originals_${input.packageId}`,
        email: user.email || "",
      },
    })

    await sendCapiEvent({
      eventName: "InitiateCheckout",
      eventId: `checkout-${order.id}`,
      email: user.email,
      externalId: user.id,
      value: pack.priceInr,
      currency: "INR",
      sourceUrl: "https://www.aidirectorhub.com/originals",
      customData: {
        content_name: `Originals Credits: ${pack.credits}`,
        content_type: "credits",
        content_ids: [`originals_${input.packageId}`],
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: pack.priceInr * 100,
      priceInr: pack.priceInr,
      keyId,
      credits: pack.credits,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Viewer",
    })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Order creation failed" },
      { status: 500 },
    )
  }
}
