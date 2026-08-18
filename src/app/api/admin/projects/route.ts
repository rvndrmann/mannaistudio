import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/membership"
import { describeError } from "@/lib/studio/errors"

const accessSchema = z.object({
  projectId: z.string().uuid(),
  action: z.enum(["open", "close"]).default("open"),
}).strict()

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, admin: false }
  return { supabase, user, admin: await isAdminUser(supabase, user.id) }
}

export async function GET() {
  try {
    const { supabase, user, admin } = await requireAdmin()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 })

    const { data, error } = await supabase.rpc("admin_project_overview")
    if (error) throw error
    return NextResponse.json({ projects: data || [] })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not load projects") }, { status: 500 })
  }
}

/**
 * Grants or drops the admin's own access to a production.
 *
 * Granting is a real membership row rather than a hidden bypass, so the owner
 * can see who opened their project and the access can be dropped again when
 * the admin is finished.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, admin } = await requireAdmin()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 })

    const input = accessSchema.parse(await request.json())
    const { error } = await supabase.rpc(
      input.action === "open" ? "admin_grant_project_access" : "admin_revoke_project_access",
      { p_project_id: input.projectId },
    )
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    return NextResponse.json({ error: describeError(error, "Could not change project access") }, { status: 500 })
  }
}
