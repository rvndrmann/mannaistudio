import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/membership"
import { describeError } from "@/lib/studio/errors"

export const dynamic = "force-dynamic"

/**
 * The briefs people started and did not pay for.
 *
 * `admin_managed_brief_drafts` checks `admin_users` itself and returns nothing
 * to anybody else, so the test here is about answering with a useful 403 rather
 * than an empty list — same arrangement as the order queue beside it.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!await isAdminUser(supabase, user.id)) return NextResponse.json({ error: "Admins only" }, { status: 403 })

    const { data, error } = await supabase.rpc("admin_managed_brief_drafts")
    if (error) throw error
    return NextResponse.json({ drafts: data || [] })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not load unfinished briefs") }, { status: 500 })
  }
}
