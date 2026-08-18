import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireBrand } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const patchChatSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  agentKey: z.string().trim().min(1).max(60).optional(),
}).strict()

export async function GET(_request: NextRequest, { params }: { params: Promise<{ brandId: string; chatId: string }> }) {
  try {
    const { brandId, chatId } = await params
    const context = await requireBrand(brandId)
    const { data: chat } = await context.supabase
      .from("creator_brand_chats")
      .select("id,title,agent_key,updated_at")
      .eq("id", chatId).eq("brand_id", brandId).eq("user_id", context.user.id)
      .maybeSingle()
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 })

    const { data: messages, error } = await context.supabase
      .from("creator_brand_chat_messages")
      .select("id,role,agent_key,content,attachments,tool_notes,created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(400)
    if (error) throw error
    return NextResponse.json({ chat, messages: messages || [] })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load the chat") }, { status: studioErrorStatus(error) })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string; chatId: string }> }) {
  try {
    const { brandId, chatId } = await params
    const context = await requireBrand(brandId)
    const input = patchChatSchema.parse(await request.json())
    const { data, error } = await context.supabase
      .from("creator_brand_chats")
      .update({ ...(input.title ? { title: input.title } : {}), ...(input.agentKey ? { agent_key: input.agentKey } : {}) })
      .eq("id", chatId).eq("brand_id", brandId).eq("user_id", context.user.id)
      .select("id,title,agent_key,updated_at")
      .single()
    if (error) throw error
    return NextResponse.json({ chat: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid chat", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not update the chat") }, { status: studioErrorStatus(error) })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string; chatId: string }> }) {
  try {
    const { brandId, chatId } = await params
    const context = await requireBrand(brandId)
    const { error } = await context.supabase.from("creator_brand_chats").delete().eq("id", chatId).eq("brand_id", brandId).eq("user_id", context.user.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the chat") }, { status: studioErrorStatus(error) })
  }
}
