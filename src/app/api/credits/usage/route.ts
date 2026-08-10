import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200)
    const { data, error: usageError } = await supabase
      .from("credit_transactions")
      .select("id,amount,balance_after,type,model,description,created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (usageError) throw usageError

    return NextResponse.json({ transactions: data || [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load credit usage" }, { status: 500 })
  }
}
