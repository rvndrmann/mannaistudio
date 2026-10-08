import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"
const schema = z.object({ visitorId: z.string().uuid(), body: z.string().trim().min(1).max(8000) }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await params
    const { visitorId, body } = schema.parse(await request.json())
    const service = createServiceClient()
    const { data: conversation } = await service.from("creative_agent_conversations").select("id,agent_paused").eq("id", conversationId).eq("visitor_id", visitorId).maybeSingle()
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
    const { data: message, error } = await service.from("creative_agent_messages").insert({ conversation_id: conversationId, sender: "visitor", body }).select().single()
    if (error) throw error
    await service.from("creative_agent_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId)
    // V1 deliberately has no model call. When enabled it acknowledges receipt;
    // when paused, the admin has full control of the conversation.
    let agentMessage = null
    if (!conversation.agent_paused) {
      const { data } = await service.from("creative_agent_messages").insert({ conversation_id: conversationId, sender: "agent", body: "Thanks — I’ve added that to your creative brief. Share any missing details or references, and our team will use the complete conversation when preparing your order." }).select().single()
      agentMessage = data
    }
    return NextResponse.json({ message, agentMessage }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Could not send your message." }, { status: 400 })
  }
}
