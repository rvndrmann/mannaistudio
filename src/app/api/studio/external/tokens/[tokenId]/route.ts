import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function currentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<unknown> }) {
  try {
    const value = await params
    const tokenId = typeof value === "object" && value && "tokenId" in value ? String(value.tokenId) : ""
    if (!tokenId) return NextResponse.json({ error: "Token id is required" }, { status: 400 })
    const { supabase, user } = await currentUser()
    const { error } = await supabase
      .from("creator_external_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke external token" }, { status: 400 })
  }
}
