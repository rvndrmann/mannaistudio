import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions, selectConversationWindow } from "@/lib/studio/conversation"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { directorChatInputSchema } from "@/lib/studio/domain"
import { createDirectorResponse, defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import { generateOpenAIImage } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { requestDirectorTool } from "@/lib/studio/tool-service"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const body = directorChatInputSchema.parse({ ...(await request.json()), projectId })
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", body.episodeId).eq("project_id", projectId).maybeSingle()
    if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    const { data: modelSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle()
    const activeModels = activeDirectorModels(modelSettings?.value)
    const fallbackModel = activeModels.find((item) => item.id === defaultOpenAIDirectorModel())?.id || activeModels[0]?.id || defaultOpenAIDirectorModel()
    const model = body.model || fallbackModel
    if (!activeModels.some((item) => item.id === model)) {
      return NextResponse.json({ error: "This AI Director model is paused by an admin." }, { status: 403 })
    }
    const { data: existingSession } = await context.supabase.from("creator_chat_sessions").select("id").eq("episode_id", episode.id).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    const sessionId = body.sessionId || existingSession?.id || (await context.supabase.from("creator_chat_sessions").insert({ episode_id: episode.id, user_id: context.user.id, title: "AI Director", model }).select("id").single()).data?.id
    if (!sessionId) throw new Error("Could not create an AI Director chat session")
    await context.supabase.from("creator_chat_sessions").update({ model }).eq("id", sessionId).eq("user_id", context.user.id)
    const { data: history, error: historyError } = await context.supabase.from("creator_chat_messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(40)
    if (historyError) throw historyError
    const { data: userMessage, error: userError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, role: "user", content: body.message }).select().single()
    if (userError) throw userError
    const workflow = await maybeHandleWorkflowRequest({ context, projectId, episodeId: episode.id, sessionId, message: body.message, history: history || [], idempotencyKey: body.idempotencyKey })
    if (workflow) {
      const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert(workflow.message).select().single()
      if (assistantError) throw assistantError
      return NextResponse.json({ sessionId, userMessage, assistantMessage, workflow: workflow.result, provider: workflow.provider, model })
    }
    const project = await buildProjectContext(context.supabase, context.project)
    const { data: instructionSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
    const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings?.value)
    const response = await createDirectorResponse({ userId: context.user.id, model, instructions: await buildWorkflowInstructions(context, episode.id, sessionId, buildDirectorInstructions(project, globalInstructions)), messages: selectConversationWindow([...(history || []).filter((item) => item.content).map((item) => ({ role: item.role as "user" | "assistant", content: item.content as string })), { role: "user", content: body.message }]) })
    const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, role: "assistant", content: response.content }).select().single()
    if (assistantError) throw assistantError
    return NextResponse.json({ sessionId, userMessage, assistantMessage, provider: "openai", model, usage: response.usage })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid chat request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI Director chat failed" }, { status: error instanceof OpenAIProviderError ? error.status : studioErrorStatus(error) })
  }
}

async function buildWorkflowInstructions(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, episodeId: string, sessionId: string, baseInstructions: string) {
  const workflows = await fetchDirectorWorkflows(context.supabase)
  const metadata = (context.project.metadata as Record<string, unknown> | undefined) || {}
  const episodeWorkflows = (metadata.episode_workflows as Record<string, unknown> | undefined) || {}
  const selectedId = typeof episodeWorkflows[episodeId] === "string"
    ? episodeWorkflows[episodeId] as string
    : typeof metadata.default_workflow_id === "string"
      ? metadata.default_workflow_id
      : typeof (metadata.basic_settings as Record<string, unknown> | undefined)?.workflow === "string"
        ? (metadata.basic_settings as Record<string, unknown>).workflow as string
        : ""
  const workflow = workflows.find((item) => item.id === selectedId && item.status === "active")
  const uploadContext = await recentUploadContext(context, sessionId)
  const workflowLines = workflow ? [
    "Selected AI Director workflow:",
    `Workflow: ${workflow.title} (${workflow.id})`,
    `Workflow skill: ${workflow.skill || "Not specified"}`,
    `Workflow instructions: ${workflow.instructions || workflow.description || "Follow the selected workflow."}`,
  ] : []
  return [
    baseInstructions,
    ...workflowLines,
    ...uploadContext,
  ].join("\n")
}

async function recentUploadContext(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, sessionId: string) {
  const { data } = await context.supabase
    .from("creator_chat_messages")
    .select("media,created_at")
    .eq("session_id", sessionId)
    .not("media", "is", null)
    .order("created_at", { ascending: false })
    .limit(10)
  const media = (data || []).flatMap((message) => Array.isArray(message.media) ? message.media : [])
  if (!media.length) return []
  return [
    "Recent user-uploaded chat media available as references. You may propose adding these to assets or storyboard, and you may use image paths as generation references when the user asks:",
    ...media.map((item, index) => {
      const value = item as Record<string, unknown>
      return `${index + 1}. type=${String(value.type || "file")} name=${String(value.name || "uploaded media")} storage_path=${String(value.path || "")} content_type=${String(value.contentType || "")}`
    }),
  ]
}

async function maybeHandleWorkflowRequest(input: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; projectId: string; episodeId: string; sessionId: string; message: string; history: { role: string; content: string | null }[]; idempotencyKey: string }) {
  const normalized = input.message.toLowerCase()
  const scriptIntent = await maybeHandleScriptWrite(input, normalized)
  if (scriptIntent) return scriptIntent
  if (/\b(character|asset|prop|location)\b/.test(normalized) && /\b(image|images|visual|reference|references|create|make|generate)\b/.test(normalized)) {
    return textMessage(input.sessionId, "I can help create character and asset references from the saved script. First I need you to choose each character or asset in the Characters & Assets tab, then generate images from those asset prompts so the references stay organized.")
  }
  if (/\b(full auto|full-auto|autopilot)\b/.test(normalized) && /\b(enable|turn on|start|activate)\b/.test(normalized)) {
    const result = await requestDirectorTool(input.context, {
      tool: "update_full_auto_mode",
      input: { enabled: true, creditCap: 500, maxJobsPerRun: 10, allowDestructiveActions: false },
      sessionId: input.sessionId,
      idempotencyKey: `${input.idempotencyKey}:full-auto`,
    })
    return proposalMessage(input.sessionId, "I prepared a full-auto mode proposal with credit and job guardrails. Approve it here before I can run the workflow automatically.", result)
  }
  if (/\b(video|animate|motion)\b/.test(normalized) && /\b(generate|create|make|render|produce)\b/.test(normalized)) {
    const { data: shots, error } = await input.context.supabase.from("creator_shots").select("id,prompt,title").eq("episode_id", input.episodeId).order("order_index").limit(6)
    if (error) throw error
    const selectedShots = (shots ?? []).filter((shot) => shot.prompt).slice(0, 3)
    if (!selectedShots.length) return textMessage(input.sessionId, "I need at least one storyboard shot with a prompt before I can prepare video generation.")
    const result = await requestDirectorTool(input.context, {
      tool: "submit_generation",
      input: {
        request: { type: "video", shotIds: selectedShots.map((shot) => shot.id), preference: "balanced", durationSeconds: 4 },
        prompts: Object.fromEntries(selectedShots.map((shot) => [shot.id, shot.prompt || shot.title])),
        idempotencyKey: `${input.idempotencyKey}:video`,
      },
      sessionId: input.sessionId,
      idempotencyKey: `${input.idempotencyKey}:video-proposal`,
    })
    return proposalMessage(input.sessionId, `I prepared video generation for ${selectedShots.length} shot${selectedShots.length === 1 ? "" : "s"}. Review and approve before credits are reserved.`, result)
  }
  if (/\b(image|keyframe|poster|visual)\b/.test(normalized) && /\b(generate|create|make|draw)\b/.test(normalized)) {
    const prompt = input.message.replace(/^.*?\b(generate|create|make|draw)\b/i, "").trim() || input.message
    const image = await generateOpenAIImage({ userId: input.context.user.id, model: "gpt-image-2", prompt })
    const path = `${input.context.user.id}/${input.projectId}/chat/${crypto.randomUUID()}.png`
    const { error: uploadError } = await input.context.supabase.storage.from("creator-studio-media").upload(path, image, { contentType: "image/png", upsert: false })
    if (uploadError) throw uploadError
    const { data: signed } = await input.context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    return {
      provider: "openai",
      result: { type: "image", path },
      message: {
        session_id: input.sessionId,
        role: "assistant",
        content: "Generated the image and attached it here for review.",
        media: [{ type: "image", path, url: signed?.signedUrl, prompt, provider: "openai", model: "gpt-image-2" }],
      },
    }
  }
  if (/\b(script|shot|storyboard|asset|character|prop|location)\b/.test(normalized) && /\b(delete|remove)\b/.test(normalized)) {
    return textMessage(input.sessionId, "I can delete saved script, asset, or storyboard content after you choose the exact item. Tell me the asset or shot name, then I will show an approval card before deleting anything.")
  }
  if (/\b(script|shot|storyboard|asset|character|prop|location)\b/.test(normalized) && /\b(edit|update|change|rewrite|save)\b/.test(normalized)) {
    return textMessage(input.sessionId, "I can prepare that saved edit, but I need the exact target and replacement text. Send the shot, asset, or script section plus the new content, and I will show an approval card before applying it.")
  }
  return null
}

async function maybeHandleScriptWrite(input: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; episodeId: string; sessionId: string; message: string; history: { role: string; content: string | null }[] }, normalized: string) {
  const wantsScriptWrite = /\b(script|screenplay|scene|sequence)\b/.test(normalized)
  const wantsAdd = /\b(add|append|put|insert|save)\b/.test(normalized)
  const wantsReplace = /\b(replace|overwrite|supersede)\b/.test(normalized)
  const confirmsReplace = /\b(yes|confirm|confirmed|do it|ok|okay)\b/.test(normalized) && /\b(replace|current script)\b/.test(normalized)
  if ((!wantsScriptWrite || (!wantsAdd && !wantsReplace)) && !confirmsReplace) return null

  const sourceMessage = confirmsReplace
    ? [...input.history].reverse().find((item) => item.role === "user" && item.content && /\b(add|replace|append|put|insert|save)\b.*\b(script|screenplay|scene|sequence)\b/i.test(item.content))?.content || ""
    : input.message
  const extracted = extractScriptText(sourceMessage)
  if (!looksLikeScript(extracted)) return null

  const { data: episode, error } = await input.context.supabase
    .from("creator_episodes")
    .select("script_content")
    .eq("id", input.episodeId)
    .single()
  if (error) throw error

  const current = parseStoredScript(episode?.script_content)
  const nextScriptBlock = scriptTextToFullScript(extracted)
  const shouldReplace = wantsReplace || confirmsReplace || (!current.body.trim() && !current.overview.trim() && !current.scenes.length)
  const nextScript = shouldReplace
    ? {
        title: nextScriptBlock.title || current.title || "Untitled production",
        overview: current.overview || "",
        body: extracted,
        scenes: [],
      }
    : {
        ...current,
        title: current.title || nextScriptBlock.title || "Untitled production",
        body: [current.body, extracted].filter(Boolean).join("\n\n"),
        scenes: current.scenes || [],
      }

  const { error: updateError } = await input.context.supabase
    .from("creator_episodes")
    .update({ script_content: nextScript, script_updated_at: new Date().toISOString() })
    .eq("id", input.episodeId)
  if (updateError) throw updateError

  return textMessage(
    input.sessionId,
    shouldReplace
      ? `Done. I replaced the current script with "${nextScript.title}" and saved it to the Script tab.`
      : `Done. I added the script text to "${nextScript.title}" and saved it to the Script tab.`,
    { type: "script_saved", mode: shouldReplace ? "replace" : "append", script: nextScript },
  )
}

function extractScriptText(message: string) {
  return message
    .replace(/^\s*(add|append|put|insert|save|replace|overwrite)\s+(this\s+)?(to|in|into|as)?\s*(the\s+)?(current\s+)?(script|screenplay|scene|sequence)\s*(?:-|:|—)?\s*/i, "")
    .trim()
}

function looksLikeScript(text: string) {
  const trimmed = text.trim()
  if (trimmed.length < 120) return false
  const hasTiming = /\b\d{1,2}:\d{2}\s*(?:-|–|—)\s*\d{1,2}:\d{2}\b/.test(trimmed)
  const hasScriptLabels = /\b(title|episode|duration|characters|script|cliffhanger question)\s*:/i.test(trimmed)
  const hasDialogue = /^[A-Z][A-Za-z .'-]{1,40}\s*:/m.test(trimmed)
  return hasTiming || (hasScriptLabels && hasDialogue)
}

function parseStoredScript(value: unknown) {
  const blank = { title: "Untitled production", overview: "", body: "", scenes: [] as Array<{ heading: string; timing: string; direction: string; framing: string; continuity: string }> }
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...blank, ...(value as typeof blank), scenes: Array.isArray((value as typeof blank).scenes) ? (value as typeof blank).scenes : [] }
  if (typeof value === "string") return { ...blank, body: value }
  return blank
}

function scriptTextToFullScript(text: string) {
  const titleMatch = text.match(/\btitle\s*:\s*([^\n.]+)/i)
  const title = titleMatch?.[1]?.trim() || "New scene"
  return { title }
}

function textMessage(sessionId: string, content: string, result: Record<string, unknown> = { type: "text" }) {
  return { provider: "workflow", result, message: { session_id: sessionId, role: "assistant", content } }
}

function proposalMessage(sessionId: string, content: string, result: unknown) {
  const proposal = typeof result === "object" && result && "proposal" in result ? (result as { proposal?: unknown }).proposal : null
  return {
    provider: "workflow",
    result,
    message: {
      session_id: sessionId,
      role: "assistant",
      content,
      suggested_actions: proposal ? [{ type: "proposal", proposal }] : [],
    },
  }
}
