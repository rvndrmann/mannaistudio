import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

const createTeamSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict()

export type TeamMemberRow = {
  profile_id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  role: string
  credits_balance: number
  joined_at: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase.from("team_members").select("team_id,role").eq("profile_id", user.id).maybeSingle()
    if (!membership) return NextResponse.json({ team: null, members: [], role: null, userId: user.id })

    const [{ data: team }, { data: members, error: rosterError }] = await Promise.all([
      supabase.from("teams").select("id,name,owner_id,created_at,credits_balance").eq("id", membership.team_id).maybeSingle(),
      supabase.rpc("team_roster"),
    ])
    if (rosterError) throw rosterError

    return NextResponse.json({ team, members: (members || []) as TeamMemberRow[], role: membership.role, userId: user.id })
  } catch (err) {
    // Supabase returns plain error objects rather than Error instances, so read
    // the message off the object instead of collapsing it to a generic string.
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message
    return NextResponse.json({ error: message || "Could not load team" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = createTeamSchema.parse(await request.json())
    const { data, error: createError } = await supabase.rpc("create_team", { p_name: input.name })
    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

    return NextResponse.json({ teamId: data })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "A team name is required" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create team" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = createTeamSchema.parse(await request.json())
    const { error: renameError } = await supabase.rpc("rename_team", { p_name: input.name })
    if (renameError) return NextResponse.json({ error: renameError.message }, { status: 400 })

    return NextResponse.json({ renamed: true })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "A team name is required" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not rename team" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { error: disbandError } = await supabase.rpc("disband_team")
    if (disbandError) return NextResponse.json({ error: disbandError.message }, { status: 400 })

    return NextResponse.json({ disbanded: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not disband team" }, { status: 500 })
  }
}
