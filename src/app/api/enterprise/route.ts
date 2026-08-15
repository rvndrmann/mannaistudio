import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { normalizeEnterpriseRate } from "@/lib/enterprise"

const orderSchema = z.object({
  minutes: z.number().positive().max(600),
  brief: z.string().trim().max(5_000).default(""),
  projectId: z.string().uuid().optional(),
  contactName: z.string().trim().max(200).default(""),
  contactEmail: z.string().trim().max(320).default(""),
  contactPhone: z.string().trim().max(60).default(""),
}).strict()

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: rateRow } = await supabase.from("site_settings").select("value").eq("key", "enterprise_rate").maybeSingle()
    const rate = normalizeEnterpriseRate(rateRow?.value)
    if (!user) return NextResponse.json({ rate, orders: [], creditBalance: null })

    // The order is paid for in credits, so the form has to be able to say
    // whether this one can be afforded before the button is pressed.
    const { data: profile } = await supabase.from("profiles").select("credits_balance").eq("id", user.id).maybeSingle()
    const creditBalance = typeof profile?.credits_balance === "number" ? profile.credits_balance : 0

    const { data: orders, error } = await supabase
      .from("enterprise_orders")
      .select("id,project_id,minutes,rate_usd_per_minute,total_usd,status,brief,admin_note,created_at,credits_charged,credits_refunded_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25)
    if (error) throw error

    return NextResponse.json({ rate, orders: orders || [], creditBalance })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load enterprise details" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = orderSchema.parse(await request.json())
    const { data, error: orderError } = await supabase.rpc("create_enterprise_order", {
      p_minutes: input.minutes,
      p_brief: input.brief,
      p_project_id: input.projectId ?? null,
      p_contact_name: input.contactName,
      p_contact_email: input.contactEmail || user.email || "",
      p_contact_phone: input.contactPhone,
    })
    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 })

    return NextResponse.json({ order: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Enter how many finished minutes you need" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not place the order" }, { status: 500 })
  }
}
