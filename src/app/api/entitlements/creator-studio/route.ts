import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCreatorStudioAccess } from "@/lib/studio/entitlement"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ entitled: false }, { status: 401 })

  const access = await getCreatorStudioAccess(supabase, user.id)
  return NextResponse.json(access)
}
