import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createExternalToken, hashExternalToken, tokenDisplayPrefix } from "@/lib/studio/external-auth"

const defaultScopes = ["director:chat", "director:tools", "projects:read"]

async function currentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser()
    const { data, error } = await supabase
      .from("creator_external_access_tokens")
      .select("id,name,token_prefix,scopes,last_used_at,revoked_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ tokens: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load external tokens" }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser()
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "AI Director MCP/CLI"
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown) => typeof scope === "string") : defaultScopes
    const scopes = requestedScopes.filter((scope: string) => defaultScopes.includes(scope))
    const token = createExternalToken()
    const { data, error } = await supabase
      .from("creator_external_access_tokens")
      .insert({
        user_id: user.id,
        name,
        token_hash: hashExternalToken(token),
        token_prefix: tokenDisplayPrefix(token),
        scopes: scopes.length ? scopes : defaultScopes,
      })
      .select("id,name,token_prefix,scopes,created_at")
      .single()
    if (error) throw error
    return NextResponse.json({ token, record: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create external token" }, { status: 400 })
  }
}
