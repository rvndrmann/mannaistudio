import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { McpOAuthError, requireSameOrigin } from "@/lib/studio/mcp/config"
async function currentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new McpOAuthError("access_denied", "Sign in first", 401)
  return user
}
function failure(error: unknown) {
  if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ error: "Invalid connection request" }, { status: 400 })
  return NextResponse.json({ error: error instanceof McpOAuthError ? error.message : "Could not manage connections" }, { status: error instanceof McpOAuthError ? error.status : 500 })
}
export async function GET() {
  try {
    const user = await currentUser()
    const { data, error } = await createServiceClient().from("creator_mcp_connections")
      .select("id,name,scopes,created_at,revoked_at").eq("user_id", user.id).is("revoked_at", null).order("created_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ connections: data || [] }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}
export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request)
    const user = await currentUser()
    const { id } = z.object({ id: z.string().uuid() }).strict().parse(await request.json())
    const { data, error } = await createServiceClient().from("creator_mcp_connections")
      .update({ revoked_at: new Date().toISOString(), refresh_hash: null })
      .eq("id", id).eq("user_id", user.id).select("id").maybeSingle()
    if (error || !data) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(error) }
}
