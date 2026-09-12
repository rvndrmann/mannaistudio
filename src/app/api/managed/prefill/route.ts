import { NextRequest, NextResponse } from "next/server"
import { managedErrorMessage, managedErrorStatus, requireUser } from "@/lib/managed/server"
import { parseManagedBrief, repeatBriefFrom } from "@/lib/managed-brief"

export const dynamic = "force-dynamic"

/**
 * What we already know about this client, for the brief to start from.
 *
 * Brand, product, audience and platforms carry over; the offer, the goal and
 * the creative direction do not, because those are what a new campaign is for
 * and quietly repeating last month's sale is worse than an empty field.
 * Attachments are dropped too — a product shot from a previous campaign is
 * usually the wrong one, and it is one click to re-attach.
 *
 * `from` names a specific project for "Create another campaign"; without it the
 * most recent one is used, which is what makes a second order faster than the
 * first without anyone asking for it.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    const from = (request.nextUrl.searchParams.get("from") || "").trim()

    let query = supabase
      .from("managed_projects")
      .select("id,name,brief,aspect_ratio,service_type,brand_id")
      .eq("user_id", user.id)
      .in("payment_status", ["paid", "proposal_requested"])
      .order("created_at", { ascending: false })
      .limit(1)
    if (from) query = query.eq("id", from)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ brief: null })

    return NextResponse.json({
      brief: repeatBriefFrom(parseManagedBrief(data.brief)),
      aspectRatio: data.aspect_ratio,
      serviceType: data.service_type,
      brandId: data.brand_id,
      sourceName: data.name,
    })
  } catch (error) {
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not load your details") },
      { status: managedErrorStatus(error) },
    )
  }
}
