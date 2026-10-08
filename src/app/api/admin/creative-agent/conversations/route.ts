import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"

export const dynamic = "force-dynamic"
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !await isAdminUser(supabase, user.id)) return NextResponse.json({ error: "Admins only" }, { status: 403 })
  const service = createServiceClient()
  const { data, error } = await service.from("creative_agent_conversations").select("*, creative_agent_messages(id,body,sender,created_at)").order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: "Could not load conversations." }, { status: 500 })
  return NextResponse.json({ conversations: data ?? [] })
}
