import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"

export const dynamic = "force-dynamic"
const schema = z.object({ action: z.enum(["pause", "resume", "message"]), body: z.string().trim().min(1).max(8000).optional() }).strict()
export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user || !await isAdminUser(supabase, user.id)) return NextResponse.json({ error: "Admins only" }, { status: 403 })
  try {
    const { conversationId } = await params; const input = schema.parse(await request.json()); const service = createServiceClient()
    if (input.action === "message") {
      if (!input.body) return NextResponse.json({ error: "Write a message." }, { status: 400 })
      const { data, error } = await service.from("creative_agent_messages").insert({ conversation_id: conversationId, sender: "admin", body: input.body }).select().single()
      if (error) throw error
      await service.from("creative_agent_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId)
      return NextResponse.json({ message: data })
    }
    const { data, error } = await service.from("creative_agent_conversations").update({ agent_paused: input.action === "pause", updated_at: new Date().toISOString() }).eq("id", conversationId).select().single()
    if (error) throw error
    return NextResponse.json({ conversation: data })
  } catch { return NextResponse.json({ error: "Could not update conversation." }, { status: 400 }) }
}
