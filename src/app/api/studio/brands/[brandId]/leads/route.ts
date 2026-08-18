import { NextRequest, NextResponse } from "next/server"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

/**
 * Visitors the website widget talked to.
 *
 * Captured leads first, because those are the ones somebody can act on; the
 * rest are conversations that never left a contact, kept because they say what
 * visitors are actually asking for.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const capturedOnly = new URL(request.url).searchParams.get("captured") === "1"

    let query = context.supabase
      .from("brand_lead_sessions")
      .select("id,name,email,phone,company,intent,message_count,source_path,captured_at,created_at,transcript")
      .eq("brand_id", brandId)
      .order("captured_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200)
    if (capturedOnly) query = query.not("captured_at", "is", null)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ leads: data || [] })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load leads") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const leadId = new URL(request.url).searchParams.get("id") || ""
    if (!leadId) return NextResponse.json({ error: "Which lead?" }, { status: 400 })
    const { error } = await context.supabase.from("brand_lead_sessions").delete().eq("id", leadId).eq("brand_id", brandId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the lead") }, { status: studioErrorStatus(error) })
  }
}
