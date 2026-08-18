import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { activeBrandAgents } from "@/lib/studio/brand"
import { requireBrand } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const createChatSchema = z.object({
  agentKey: z.string().trim().min(1).max(60).default("content_strategist"),
  title: z.string().trim().min(1).max(160).optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrand(brandId)
    const input = createChatSchema.parse(await request.json().catch(() => ({})))

    const { data: agentRows } = await context.supabase.from("creator_brand_agents").select("*").eq("brand_id", brandId)
    const agents = activeBrandAgents(agentRows || [])
    if (!agents.some((agent) => agent.agent_key === input.agentKey)) {
      return NextResponse.json({ error: "That agent is not available on this brand." }, { status: 400 })
    }

    const { data, error } = await context.supabase
      .from("creator_brand_chats")
      .insert({ brand_id: brandId, user_id: context.user.id, agent_key: input.agentKey, title: input.title || "New chat" })
      .select("id,title,agent_key,updated_at")
      .single()
    if (error) throw error
    return NextResponse.json({ chat: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid chat", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not start the chat") }, { status: studioErrorStatus(error) })
  }
}
