import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"
const schema = z.object({ visitorId: z.string().uuid() }).strict()

export async function POST(request: NextRequest) {
  try {
    const { visitorId } = schema.parse(await request.json())
    const service = createServiceClient()
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    if (user) await service.from("creative_agent_conversations").upsert({ visitor_id: visitorId, user_id: user.id }, { onConflict: "visitor_id" })
    else await service.from("creative_agent_conversations").upsert({ visitor_id: visitorId }, { onConflict: "visitor_id", ignoreDuplicates: true })
    const { data: conversation, error } = await service.from("creative_agent_conversations").select("*").eq("visitor_id", visitorId).single()
    if (error) throw error
    const { data: messages, error: messageError } = await service.from("creative_agent_messages").select("*").eq("conversation_id", conversation.id).order("created_at")
    if (messageError) throw messageError
    return NextResponse.json({ conversation, messages: messages ?? [] })
  } catch {
    return NextResponse.json({ error: "Could not open this conversation." }, { status: 400 })
  }
}
