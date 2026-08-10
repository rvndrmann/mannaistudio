import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 60, 200)
    const { data, error } = await supabase.rpc("project_activity", { p_project_id: projectId, p_limit: limit })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ activity: data || [], userId: user.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load project activity" }, { status: 500 })
  }
}
