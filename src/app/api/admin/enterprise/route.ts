import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

const updateSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["requested", "quoted", "in_production", "delivered", "cancelled"]),
  adminNote: z.string().trim().max(2_000).optional(),
}).strict()

const rateSchema = z.object({
  usdPerMinute: z.number().int().positive().max(100_000),
  enabled: z.boolean().default(true),
}).strict()

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = rateSchema.parse(await request.json())
    const { data, error } = await supabase.rpc("admin_update_enterprise_rate", {
      p_usd_per_minute: input.usdPerMinute,
      p_enabled: input.enabled,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ rate: data })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Enter a whole dollar rate above zero" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update the rate" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // RLS already limits this table to the owner or an admin; admins see every row.
    const { data, error } = await supabase
      .from("enterprise_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ orders: data || [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load orders" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = updateSchema.parse(await request.json())
    const { data, error } = await supabase.rpc("admin_update_enterprise_order", {
      p_order_id: input.orderId,
      p_status: input.status,
      p_admin_note: input.adminNote ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ order: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid order update" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update the order" }, { status: 500 })
  }
}
