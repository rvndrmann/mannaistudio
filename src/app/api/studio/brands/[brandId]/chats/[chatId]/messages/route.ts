import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { activeBrandAgents, brandChatMessageInputSchema, brandChatTitle, buildBrandAgentInstructions, extractScriptDraft } from "@/lib/studio/brand"
import { ensureBrandWebsiteSnapshot, executeBrandTool, loadBrandBriefingMaterial, requireBrand } from "@/lib/studio/brand-server"
import { brandFunctionDefinitions, brandHandoffSchema, brandTeamRoster, describeBrandToolResult, type BrandToolName } from "@/lib/studio/brand-tools"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { buildVisionUserContent, inlineImage, type DirectorVisionAttachment } from "@/lib/studio/director-vision"
import { createGoogleDirectorToolTurn, GoogleProviderError } from "@/lib/studio/google"
import { describeError } from "@/lib/studio/errors"
import { createDirectorToolTurn, defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

// The agent reads the whole brand plus the conversation so far, and a strategy
// answer runs long. Well short of the Director's five minutes, which spends its
// time inside image models rather than in one text turn.
export const maxDuration = 120

const MEDIA_BUCKET = "creator-studio-media"
const HISTORY_LIMIT = 30
// Enough to read the site, record what it learned, and answer. These tools are
// cheap writes, not a production pipeline, so a long loop would only be a way
// for a confused turn to keep going.
const MAX_TOOL_STEPS = 4
const MAX_ATTACHMENT_BUDGET_BYTES = 12 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string; chatId: string }> }) {
  try {
    const { brandId, chatId } = await params
    const context = await requireBrand(brandId)
    const input = brandChatMessageInputSchema.parse(await request.json())

    const { data: chat } = await context.supabase
      .from("creator_brand_chats")
      .select("id,title,agent_key")
      .eq("id", chatId).eq("brand_id", brandId).eq("user_id", context.user.id)
      .maybeSingle()
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 })

    const { data: agentRows } = await context.supabase.from("creator_brand_agents").select("*").eq("brand_id", brandId)
    const agents = activeBrandAgents(agentRows || [])
    const agentKey = input.agentKey || chat.agent_key
    const agent = agents.find((item) => item.agent_key === agentKey)
    if (!agent) return NextResponse.json({ error: "That agent is not available on this brand." }, { status: 400 })

    const { data: modelSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle()
    const models = activeDirectorModels(modelSettings?.value)
    const fallbackModel = models.find((item) => item.id === defaultOpenAIDirectorModel())?.id || models[0]?.id || defaultOpenAIDirectorModel()
    const model = input.model || fallbackModel
    if (!models.some((item) => item.id === model)) {
      return NextResponse.json({ error: "This model is paused by an admin." }, { status: 403 })
    }

    // The site is read here rather than on a timer, so an agent answering about
    // a product always has the brand's own description of it to hand.
    const brand = await ensureBrandWebsiteSnapshot(context)
    const [{ knowledge, assets }, history] = await Promise.all([
      loadBrandBriefingMaterial(context.supabase, brandId),
      context.supabase
        .from("creator_brand_chat_messages")
        .select("role,content")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(HISTORY_LIMIT),
    ])
    if (history.error) throw history.error

    const { data: userMessage, error: userError } = await context.supabase
      .from("creator_brand_chat_messages")
      .insert({ chat_id: chatId, role: "user", agent_key: agentKey, content: input.message, attachments: input.attachments })
      .select("id,role,agent_key,content,attachments,tool_notes,created_at")
      .single()
    if (userError) throw userError

    const attachments = await resolveAttachments(context.supabase, input.attachments)
    const items: Array<Record<string, unknown>> = [
      ...(history.data || []).map((message) => ({ role: message.role, content: message.content || "" })),
      { role: "user", content: buildVisionUserContent(input.message, attachments) },
    ]

    const tools = brandFunctionDefinitions()
    let currentBrand = brand
    let activeAgent = agent
    let content = ""
    const toolNotes: string[] = []
    const savedKnowledge: Record<string, unknown>[] = []
    const savedAssets: Record<string, unknown>[] = []

    // Rebuilt each step because both halves of it move: the agent changes on a
    // handover, and the brand changes the moment the agent records something.
    const instructionsFor = () => [
      buildBrandAgentInstructions({ agent: activeAgent, brand: currentBrand, knowledge, assets }),
      "",
      brandTeamRoster(agents, activeAgent.agent_key),
    ].join("\n")

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const instructions = instructionsFor()
      const turn = model.startsWith("gemini")
        ? await createGoogleDirectorToolTurn({ userId: context.user.id, model, instructions, items, tools })
        : await createDirectorToolTurn({ userId: context.user.id, model, instructions, items, tools })
      if (turn.content) content = turn.content
      if (!turn.calls.length) break

      // Every call of the batch is recorded before any output. Gemini replays a
      // parallel batch as one model turn, and mixing calls with outputs is what
      // makes it read the next call as part of the same batch.
      for (const call of turn.calls) {
        items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
      }

      for (const call of turn.calls) {
        try {
          // A handover is loop control rather than a write, so it is answered
          // here: the named agent takes over and produces this turn's reply
          // itself, instead of the caller paraphrasing what they would say.
          if (call.name === "hand_off_to_agent") {
            const { agent_key: targetKey, brief } = brandHandoffSchema.parse(call.arguments ?? {})
            const target = agents.find((item) => item.agent_key === targetKey)
            if (!target || target.agent_key === activeAgent.agent_key) {
              items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: `There is no other agent called "${targetKey}" on this brand. Do the work yourself.` }), thoughtSignature: call.thoughtSignature })
              continue
            }
            const from = activeAgent.name
            activeAgent = target
            // The brief is replayed as the instruction the new agent answers,
            // so it starts from what was decided rather than from scratch.
            items.push({
              type: "function_call_output",
              call_id: call.callId,
              output: JSON.stringify({ from, to: target.name, brief, note: `You are now ${target.name}. Answer the user directly from the brief. Do not introduce yourself or restate the handover.` }),
              thoughtSignature: call.thoughtSignature,
            })
            const note = describeBrandToolResult("hand_off_to_agent", { from, to: target.name })
            if (note) toolNotes.push(note)
            continue
          }

          const outcome = await executeBrandTool({ ...context, brand: currentBrand }, call.name, call.arguments, input.attachments)
          if (outcome.brand) currentBrand = outcome.brand
          if (outcome.knowledge) savedKnowledge.push(outcome.knowledge)
          if (outcome.asset) savedAssets.push(outcome.asset)
          const note = describeBrandToolResult(call.name as BrandToolName, outcome.result)
          if (note) toolNotes.push(note)
          items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(outcome.result), thoughtSignature: call.thoughtSignature })
        } catch (error) {
          // A failed write is reported to the model rather than thrown: the
          // user asked a question, and losing the answer because a field would
          // not save is a worse outcome than an unsaved field.
          items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: describeError(error, "That could not be saved.") }), thoughtSignature: call.thoughtSignature })
        }
      }
    }

    const { data: assistantMessage, error: assistantError } = await context.supabase
      .from("creator_brand_chat_messages")
      .insert({ chat_id: chatId, role: "assistant", agent_key: activeAgent.agent_key, content, attachments: [], tool_notes: toolNotes })
      .select("id,role,agent_key,content,attachments,tool_notes,created_at")
      .single()
    if (assistantError) throw assistantError

    // A chat named after its opening message reads as a list of topics instead
    // of a stack of "New chat". Only the untouched default is replaced, so a
    // title the user set by hand survives.
    const title = chat.title === "New chat" ? brandChatTitle(input.message) : chat.title
    await context.supabase
      .from("creator_brand_chats")
      .update({ title, agent_key: activeAgent.agent_key, updated_at: new Date().toISOString() })
      .eq("id", chatId).eq("user_id", context.user.id)

    return NextResponse.json({
      userMessage,
      assistantMessage,
      chat: { id: chatId, title, agent_key: activeAgent.agent_key },
      // The panel beside the chat re-renders from these, so what the agent
      // recorded appears the moment it answers rather than after a reload.
      brand: currentBrand,
      savedKnowledge,
      savedAssets,
      toolNotes,
      // Present when the agent delivered a whole script, which is what the
      // workspace offers to save as a draft.
      scriptDraft: extractScriptDraft(content),
    })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid message", issues: error.flatten() }, { status: 400 })
    if (error instanceof OpenAIProviderError || error instanceof GoogleProviderError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof OpenAIProviderError ? error.status : 502 })
    }
    return NextResponse.json({ error: studioErrorMessage(error, "The agent could not answer") }, { status: studioErrorStatus(error) })
  }
}

/**
 * Turns the attachments the user picked into images the model can actually
 * look at. Storage paths are signed first, and every image is inlined as bytes
 * — the provider fetches remote URLs itself and gives up quickly, so a product
 * shot sent as a link fails on storage latency rather than on anything the
 * user did.
 */
async function resolveAttachments(
  supabase: Awaited<ReturnType<typeof requireBrand>>["supabase"],
  requested: Array<{ path: string; url: string; name: string; kind: string }>,
): Promise<DirectorVisionAttachment[]> {
  const resolved: DirectorVisionAttachment[] = []
  let remaining = MAX_ATTACHMENT_BUDGET_BYTES

  for (let index = 0; index < requested.length; index += 1) {
    const attachment = requested[index]
    if (remaining <= 0) break
    let url = attachment.url
    if (attachment.path && !/^https?:\/\//i.test(attachment.path)) {
      const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(attachment.path, 60 * 60)
      url = data?.signedUrl || url
    }
    if (!url) continue
    const inlined = await inlineImage(url, remaining)
    if (!inlined) continue
    remaining -= inlined.bytes
    // Numbered, because save_brand_asset points at an image by position and a
    // filename is not something the model can be sure it read correctly.
    resolved.push({ label: `attachment ${index + 1}${attachment.name ? ` — ${attachment.name}` : ""}`, url: inlined.dataUrl })
  }

  return resolved
}
