import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

const roleSchema = z.enum(["admin", "member", "viewer"])
const addSchema = z.object({ email: z.string().trim().email().max(320), role: roleSchema.default("member") }).strict()
const updateSchema = z.object({ profileId: z.string().uuid(), role: roleSchema }).strict()
const removeSchema = z.object({ profileId: z.string().uuid() }).strict()

async function authed() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null }
  return { supabase, user }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = addSchema.parse(await request.json())
    const { data, error } = await supabase.rpc("add_team_member", { p_email: input.email, p_role: input.role })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ profileId: data })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not add member" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = updateSchema.parse(await request.json())
    const { error } = await supabase.rpc("update_team_member_role", { p_profile_id: input.profileId, p_role: input.role })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ updated: true })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid role change request" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update role" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = removeSchema.parse(await request.json())
    const { error } = await supabase.rpc("remove_team_member", { p_profile_id: input.profileId })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ removed: true })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid member" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not remove member" }, { status: 500 })
  }
}
