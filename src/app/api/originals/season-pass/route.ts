import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { SEASON_PASS_DAYS, SEASON_PASS_PRICE_INR } from "@/lib/originals"

export const dynamic = "force-dynamic"

/**
 * Start a season pass purchase.
 *
 * Money, so nothing about price comes from the caller: the request names a
 * series and the price is the constant on the server. The order's notes carry
 * everything verification needs to grant the right pass to the right account,
 * and verification reads them back from Razorpay rather than from the browser.
 *
 * Deliberately not gated on membership, unlike the studio credit top-up. A
 * season pass is bought by a viewer, and requiring a subscription first is the
 * step this whole route exists to remove.
 */

const passSchema = z.object({ seriesId: z.string().uuid() }).strict()

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Sign in to buy a season pass." }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (body === null) return NextResponse.json({ error: "A series is required." }, { status: 400 })
    const input = passSchema.parse(body)

    // The series has to exist and be published before money is taken for it.
    const admin = createServiceClient()
    const { data: series } = await admin
      .from("originals_series")
      .select("id,title,is_published")
      .eq("id", input.seriesId)
      .maybeSingle()
    if (!series || !series.is_published) {
      return NextResponse.json({ error: "That series is not available." }, { status: 404 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount: SEASON_PASS_PRICE_INR * 100,
      currency: "INR",
      receipt: `pass_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "originals_season_pass",
        profile_id: user.id,
        series_id: series.id,
        days: String(SEASON_PASS_DAYS),
        email: user.email || "",
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: SEASON_PASS_PRICE_INR * 100,
      priceInr: SEASON_PASS_PRICE_INR,
      days: SEASON_PASS_DAYS,
      keyId,
      seriesTitle: series.title,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Viewer",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid series reference." }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start checkout" }, { status: 500 })
  }
}
