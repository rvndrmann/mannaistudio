import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { coachingWeekStarts } from "@/lib/coaching-week"

export async function GET(request: NextRequest) {
  const offerId = request.nextUrl.searchParams.get("id")
  if (!offerId) return NextResponse.json({ error: "Offer id is required." }, { status: 400 })

  const [currentWeekStart, nextWeekStart] = coachingWeekStarts()
  const admin = createServiceClient()
  const { data: offer, error: offerError } = await admin.from("academy_offers")
    .select("id,weekly_capacity,manual_slots_left")
    .eq("id", offerId)
    .eq("active", true)
    .maybeSingle()
  if (offerError) return NextResponse.json({ error: offerError.message }, { status: 500 })
  if (!offer) return NextResponse.json({ error: "Coaching offer unavailable." }, { status: 404 })

  const [purchaseResult, reservationResult] = await Promise.all([
    admin.from("academy_offer_purchases").select("booking_week_start").eq("offer_id", offerId),
    admin.from("academy_offer_reservations").select("week_start").eq("offer_id", offerId).gt("expires_at", new Date().toISOString()),
  ])
  if (purchaseResult.error) return NextResponse.json({ error: purchaseResult.error.message }, { status: 500 })
  if (reservationResult.error) return NextResponse.json({ error: reservationResult.error.message }, { status: 500 })

  const weeks = [currentWeekStart, nextWeekStart]
  const availability = weeks.map((weekStart, index) => {
    const booked = (purchaseResult.data || []).filter((row) => row.booking_week_start === weekStart).length
    const reserved = (reservationResult.data || []).filter((row) => row.week_start === weekStart).length
    const manual = index === 0 ? offer.manual_slots_left : null
    const capacity = manual ?? offer.weekly_capacity
    const full = capacity !== null && booked + reserved >= capacity
    return { weekStart, booked, reserved, capacity, full }
  })

  return NextResponse.json({ weeks: availability }, { headers: { "Cache-Control": "no-store" } })
}
