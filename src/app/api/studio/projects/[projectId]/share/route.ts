import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

const shareSchema = z.object({ profileId: z.string().uuid() }).strict()

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const [{ data: shares, error }, { data: project }] = await Promise.all([
      supabase.rpc("project_share_list", { p_project_id: projectId }),
      supabase.from("creator_projects").select("user_id").eq("id", projectId).maybeSingle(),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ shares: shares || [], isOwner: project?.user_id === user.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load sharing" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = shareSchema.parse(await request.json())
    const { error } = await supabase.rpc("share_project_with_member", { p_project_id: projectId, p_profile_id: input.profileId })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ shared: true })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Choose a team member" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not share project" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user } = await authed()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = shareSchema.parse(await request.json())
    const { error } = await supabase.rpc("unshare_project", { p_project_id: projectId, p_profile_id: input.profileId })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ removed: true })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Choose a team member" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not remove access" }, { status: 500 })
  }
}
