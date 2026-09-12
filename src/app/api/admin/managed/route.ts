import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/membership"
import { describeError } from "@/lib/studio/errors"

export const dynamic = "force-dynamic"

/**
 * The managed production queue.
 *
 * `admin_managed_overview` checks `admin_users` itself, so the admin test here
 * is about giving a useful 403 rather than an empty list — the database would
 * refuse a non-admin either way.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!await isAdminUser(supabase, user.id)) return NextResponse.json({ error: "Admins only" }, { status: 403 })

    const { data, error } = await supabase.rpc("admin_managed_overview")
    if (error) throw error
    return NextResponse.json({ projects: data || [] })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not load managed orders") }, { status: 500 })
  }
}
