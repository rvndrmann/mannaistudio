import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { coachingWeekStarts } from "@/lib/coaching-week"

const schema = z.object({ id: z.string().uuid(), week_start: z.string().date() })

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to book coaching." }, { status: 401 })

    const input = schema.parse(await request.json())
    const [currentWeek, nextWeek] = coachingWeekStarts()
    if (input.week_start !== currentWeek && input.week_start !== nextWeek) {
      return NextResponse.json({ error: "Choose this week or next week." }, { status: 400 })
    }

    const { data: offer } = await supabase.from("academy_offers")
      .select("id,title,price,active,offer_type")
      .eq("id", input.id).maybeSingle()
    if (!offer || !offer.active || offer.offer_type !== "coaching") {
      return NextResponse.json({ error: "This coaching offer is unavailable." }, { status: 404 })
    }

    const amount = Math.round(Number(offer.price) * 100)
    if (!Number.isSafeInteger(amount) || amount < 100) {
      return NextResponse.json({ error: "The coaching price is not configured." }, { status: 400 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `coaching_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: { type: "coaching", profile_id: user.id, offer_id: offer.id, offer_title: offer.title, week_start: input.week_start },
    })

    const admin = createServiceClient()
    const { error: reserveError } = await admin.rpc("reserve_academy_coaching_slot", {
      p_order_id: order.id,
      p_profile_id: user.id,
      p_offer_id: offer.id,
      p_week_start: input.week_start,
    })
    if (reserveError) {
      const message = reserveError.message.includes("fully booked")
        ? "That week is fully booked. Please choose next week."
        : reserveError.message
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ orderId: order.id, amount: order.amount, keyId, email: user.email || "", name: user.user_metadata?.full_name || "Creator", offerTitle: offer.title })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Choose a valid coaching week." }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start coaching checkout." }, { status: 500 })
  }
}
