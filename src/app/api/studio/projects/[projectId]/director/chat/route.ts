import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { buildDirectorInstructions, selectConversationWindow } from "@/lib/studio/conversation"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { directorChatInputSchema } from "@/lib/studio/domain"
import { defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import { generateOpenAIImage } from "@/lib/studio/openai"
import { buildProjectContext } from "@/lib/studio/project-context"
import { requireAuthenticatedProject, studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { requestDirectorTool } from "@/lib/studio/tool-service"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { runDirectorAgent } from "@/lib/studio/director-agent"
import { fetchDirectorRuntimeSettings } from "@/lib/studio/director-runtime-settings"
import { buildEntityMentionContext, type MentionableEntity } from "@/lib/studio/entity-mentions"
import { buildEntityReferenceImagePrompt, parseBulkEntityImageIntent, projectVisualStyle, visualStyleDirective, type BulkEntityImageIntent } from "@/lib/studio/entity-image-workflow"
import { createBytePlusAsset } from "@/lib/studio/byteplus"
import { calculateCreditCost, deductUserCredits } from "@/lib/studio/credits"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:chat")
    const body = directorChatInputSchema.parse({ ...(await request.json()), projectId })
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", body.episodeId).eq("project_id", projectId).maybeSingle()
    if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    const uniqueMentionIds = Array.from(new Set(body.mentionedEntityIds))
    const { data: mentionedEntities, error: mentionedEntityError } = uniqueMentionIds.length
      ? await context.supabase
        .from("creator_entities")
        .select("id,name,type,description,reference_images,metadata")
        .eq("project_id", projectId)
        .in("id", uniqueMentionIds)
      : { data: [], error: null }
    if (mentionedEntityError) throw mentionedEntityError
    if ((mentionedEntities || []).length !== uniqueMentionIds.length) {
      return NextResponse.json({ error: "One or more mentioned entities do not belong to this project." }, { status: 400 })
    }
    const mentionContext = buildEntityMentionContext((mentionedEntities || []) as MentionableEntity[])
    const modelMessage = mentionContext ? `${body.message}\n\n${mentionContext}` : body.message
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
    const { data: userMessage, error: userError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, role: "user", content: body.message, referenced_entity_ids: uniqueMentionIds }).select().single()
    if (userError) throw userError
    const workflow = await maybeHandleWorkflowRequest({ context, projectId, episodeId: episode.id, sessionId, message: body.message, history: history || [], idempotencyKey: body.idempotencyKey, mentionedEntities: (mentionedEntities || []) as ResolvedMention[] })
    if (workflow) {
      const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert(workflow.message).select().single()
      if (assistantError) throw assistantError
      const workflowCredits = workflow.result && typeof workflow.result === "object"
        ? workflow.result as Record<string, unknown>
        : {}
      return NextResponse.json({
        sessionId,
        userMessage,
        assistantMessage,
        workflow: workflow.result,
        provider: workflow.provider,
        model,
        creditsCharged: typeof workflowCredits.creditsCharged === "number" ? workflowCredits.creditsCharged : 0,
        creditBalance: typeof workflowCredits.creditBalance === "number" ? workflowCredits.creditBalance : undefined,
      })
    }
    const project = await buildProjectContext(context.supabase, context.project)
    const { data: instructionSettings } = await context.supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
    const globalInstructions = normalizeDirectorGlobalInstructions(instructionSettings?.value)
    const runtimeSettings = await fetchDirectorRuntimeSettings(context.supabase)
    const response = await runDirectorAgent({ context, model, instructions: await buildWorkflowInstructions(context, episode.id, sessionId, buildDirectorInstructions(project, globalInstructions)), messages: selectConversationWindow([...(history || []).filter((item) => item.content).map((item) => ({ role: item.role as "user" | "assistant", content: item.content as string })), { role: "user", content: modelMessage }]), sessionId, idempotencyKey: body.idempotencyKey, runtimeSettings, episodeId: episode.id, objective: modelMessage })
    const { data: assistantMessage, error: assistantError } = await context.supabase.from("creator_chat_messages").insert({ session_id: sessionId, role: "assistant", content: response.content, tool_calls: response.toolCalls, suggested_actions: response.suggestedActions, timeline_blocks: response.timeline, timeline_version: 1 }).select().single()
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

type ResolvedMention = MentionableEntity & { metadata?: Record<string, unknown> }

async function maybeHandleWorkflowRequest(input: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; projectId: string; episodeId: string; sessionId: string; message: string; history: { role: string; content: string | null }[]; idempotencyKey: string; mentionedEntities: ResolvedMention[] }) {
  const normalized = input.message.toLowerCase()
  const forbidsAllMediaGeneration = /\b(?:do not|don't|never)\s+(?:yet\s+)?(?:generate|create|make|draw)\s+(?:any\s+)?media\b/.test(normalized)
    || /\bno\s+media\b/.test(normalized)
  const forbidsImageGeneration = /\b(?:do not|don't|never)\s+(?:yet\s+)?(?:generate|create|make|draw)\s+(?!(?:any\s+)?other\b)(?:any\s+)?(?:images?|keyframes?|posters?|visuals?)\b/.test(normalized)
    || /\bno\s+(?:images?|keyframes?)\b/.test(normalized)
  const forbidsVideoGeneration = /\b(?:do not|don't|never)\s+(?:yet\s+)?(?:generate|create|make|render|produce)\s+(?:any\s+)?(?:videos?|motion|animation)\b/.test(normalized)
    || /\bno\s+(?:videos?|animation)\b/.test(normalized)
  const scriptIntent = await maybeHandleScriptWrite(input, normalized)
  if (scriptIntent) return scriptIntent
  if (/\b(full auto|full-auto|autopilot)\b/.test(normalized) && /\b(enable|turn on|start|activate)\b/.test(normalized)) {
    const result = await requestDirectorTool(input.context, {
      tool: "update_full_auto_mode",
      input: { enabled: true, creditCap: 500, maxJobsPerRun: 10, allowDestructiveActions: false },
      sessionId: input.sessionId,
      idempotencyKey: `${input.idempotencyKey}:full-auto`,
    })
    return proposalMessage(input.sessionId, "I prepared a full-auto mode proposal with credit and job guardrails. Approve it here before I can run the workflow automatically.", result)
  }
  const bulkEntityImageIntent = !forbidsAllMediaGeneration && !forbidsImageGeneration ? parseBulkEntityImageIntent(input.message) : null
  if (bulkEntityImageIntent) return generateBulkEntityReferenceImages(input, bulkEntityImageIntent)
  if (!forbidsAllMediaGeneration && !forbidsVideoGeneration && /\b(video|animate|motion)\b/.test(normalized) && /\b(generate|create|make|render|produce)\b/.test(normalized)) {
    const { data: shots, error } = await input.context.supabase.from("creator_shots").select("id,prompt,title").eq("episode_id", input.episodeId).order("order_index").limit(6)
    if (error) throw error
    const selectedShots = (shots ?? []).filter((shot) => shot.prompt).slice(0, 3)
    if (!selectedShots.length) return textMessage(input.sessionId, "I need at least one storyboard shot with a prompt before I can prepare video generation.")
    const result = await requestDirectorTool(input.context, {
      tool: "submit_generation",
      input: {
        request: { type: "video", shotIds: selectedShots.map((shot) => shot.id), mentionedEntityIds: input.mentionedEntities.map((entity) => entity.id), preference: "balanced", durationSeconds: 4 },
        prompts: Object.fromEntries(selectedShots.map((shot) => [shot.id, shot.prompt || shot.title])),
        idempotencyKey: `${input.idempotencyKey}:video`,
      },
      sessionId: input.sessionId,
      idempotencyKey: `${input.idempotencyKey}:video-proposal`,
    })
    return proposalMessage(input.sessionId, `I prepared video generation for ${selectedShots.length} shot${selectedShots.length === 1 ? "" : "s"}. Review and approve before credits are reserved.`, result)
  }
  if (!forbidsAllMediaGeneration && !forbidsImageGeneration && /\b(image|keyframe|poster|visual)\b/.test(normalized) && /\b(generate|create|make|draw)\b/.test(normalized)) {
    const shotNumberMatch = normalized.match(/\b(?:storyboard\s+)?shot\s*(?:#\s*)?(\d+)\b/)
    const requestedShotNumber = shotNumberMatch ? Number(shotNumberMatch[1]) : /\bfirst\s+(?:storyboard\s+)?shot\b/.test(normalized) ? 1 : null
    const { data: targetShot } = requestedShotNumber
      ? await input.context.supabase
        .from("creator_shots")
        .select("id,order_index,prompt,aspect_ratio,metadata,referenced_entities")
        .eq("episode_id", input.episodeId)
        .order("order_index", { ascending: true })
        .range(requestedShotNumber - 1, requestedShotNumber - 1)
        .maybeSingle()
      : { data: null }
    const prompt = (typeof targetShot?.prompt === "string" && targetShot.prompt.trim())
      ? targetShot.prompt
      : input.message.replace(/^.*?\b(generate|create|make|draw)\b/i, "").trim() || input.message
    const mentionContext = buildEntityMentionContext(input.mentionedEntities)
    const style = projectVisualStyle(input.context.project)
    const projectDefaultAspect = typeof input.context.project.default_aspect === "string" ? input.context.project.default_aspect : null
    const aspectRatio = targetShot?.aspect_ratio || projectDefaultAspect || "9:16"
    const resolvedPrompt = [prompt, `Required composition: ${aspectRatio}.`, `Required project style: ${style}.`, visualStyleDirective(style), mentionContext].filter(Boolean).join("\n\n")
    const referencePaths = Array.from(new Set(input.mentionedEntities.flatMap((entity) => entity.reference_images || []))).slice(0, 8)
    const referenceUrls = await signedMentionReferences(input.context, referencePaths)
    const creditCost = calculateCreditCost("gpt-image-2", "image", 5, { quality: "Medium", aspectRatio })
    const deduction = await deductUserCredits(
      input.context.user.id,
      creditCost,
      "gpt-image-2",
      "AI Director chat image generation",
      input.context.supabase,
    )
    if (!deduction.success) throw new OpenAIProviderError(deduction.errorMessage || "Insufficient credits", 402)
    const image = await generateOpenAIImage({ userId: input.context.user.id, model: "gpt-image-2", prompt: resolvedPrompt, referenceUrls, aspectRatio })
    const path = `${input.context.user.id}/${input.projectId}/chat/${crypto.randomUUID()}.png`
    const { error: uploadError } = await input.context.supabase.storage.from("creator-studio-media").upload(path, image, { contentType: "image/png", upsert: false })
    if (uploadError) throw uploadError
    if (targetShot) {
      const currentMetadata = targetShot.metadata && typeof targetShot.metadata === "object" ? targetShot.metadata as Record<string, unknown> : {}
      const completedAt = new Date().toISOString()
      const { error: shotUpdateError } = await input.context.supabase.from("creator_shots").update({
        keyframe_image: path,
        referenced_entities: Array.from(new Set([...(targetShot.referenced_entities || []), ...input.mentionedEntities.map((entity) => entity.id)])),
        metadata: {
          ...currentMetadata,
          image_generation: { provider: "openai", model: "gpt-image-2", prompt, resolved_prompt: resolvedPrompt, reference_images: referencePaths, mentioned_entity_ids: input.mentionedEntities.map((entity) => entity.id), status: "completed", completed_at: completedAt },
        },
      }).eq("id", targetShot.id)
      if (shotUpdateError) throw shotUpdateError
      await input.context.supabase.from("creator_generation_jobs").insert({
        user_id: input.context.user.id,
        project_id: input.projectId,
        episode_id: input.episodeId,
        shot_id: targetShot.id,
        type: "image",
        status: "completed",
        model: "gpt-image-2",
        provider: "openai",
        prompt,
        input_images: referencePaths,
        result_url: path,
        completed_at: completedAt,
      })
    }
    const { data: signed } = await input.context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    return {
      provider: "openai",
      result: {
        type: "image",
        path,
        shotId: targetShot?.id || null,
        creditsCharged: creditCost,
        creditBalance: deduction.newBalance,
      },
      message: {
        session_id: input.sessionId,
        role: "assistant",
        content: targetShot
          ? `Generated one GPT Image 2 keyframe and attached it to storyboard shot ${requestedShotNumber}.`
          : "Generated the image and attached it here for review.",
        referenced_entity_ids: input.mentionedEntities.map((entity) => entity.id),
        media: [{ type: "image", path, url: signed?.signedUrl, prompt, referencedEntityIds: input.mentionedEntities.map((entity) => entity.id), provider: "openai", model: "gpt-image-2" }],
      },
    }
  }
  return null
}

async function generateBulkEntityReferenceImages(
  input: { context: Awaited<ReturnType<typeof requireAuthenticatedProject>>; projectId: string; episodeId: string; sessionId: string; message: string; history: { role: string; content: string | null }[]; idempotencyKey: string; mentionedEntities: ResolvedMention[] },
  intent: BulkEntityImageIntent,
) {
  const { data: entities, error } = await input.context.supabase
    .from("creator_entities")
    .select("id,name,type,description,reference_images,metadata,status")
    .eq("project_id", input.projectId)
    .in("type", intent.types)
    .order("created_at")
  if (error) throw error

  const requested = (entities || []).filter((entity) => intent.regenerate || !Array.isArray(entity.reference_images) || entity.reference_images.length === 0)
  if (!requested.length) {
    const label = intent.types.length === 1 && intent.types[0] === "character" ? "characters" : "characters and assets"
    return textMessage(input.sessionId, `All matching ${label} already have reference images. Say “regenerate all” if you want to replace or refresh them.`)
  }

  const style = projectVisualStyle(input.context.project)
  const completed: Array<{ entityId: string; entityName: string; path: string; url?: string; prompt: string }> = []
  const failed: Array<{ entityName: string; error: string }> = []
  let creditsCharged = 0
  let creditBalance: number | null = null
  const batchSize = 3

  for (let offset = 0; offset < requested.length; offset += batchSize) {
    const batch = requested.slice(offset, offset + batchSize)
    const results = await Promise.allSettled(batch.map(async (entity) => {
      const prompt = buildEntityReferenceImagePrompt(entity as MentionableEntity, style)
      const existingReferences = Array.isArray(entity.reference_images) ? entity.reference_images.slice(0, 3) : []
      const referenceUrls = await signedMentionReferences(input.context, existingReferences)
      const creditCost = calculateCreditCost("gpt-image-2", "image", 5, { quality: "Medium", aspectRatio: "2:3" })
      const deduction = await deductUserCredits(
        input.context.user.id,
        creditCost,
        "gpt-image-2",
        `AI Director character/asset reference: ${entity.name}`,
        input.context.supabase,
      )
      if (!deduction.success) throw new OpenAIProviderError(deduction.errorMessage || "Insufficient credits", 402)
      creditsCharged += creditCost
      creditBalance = deduction.newBalance
      const image = await generateOpenAIImage({ userId: input.context.user.id, model: "gpt-image-2", prompt, referenceUrls, aspectRatio: "2:3" })
      const path = `${input.context.user.id}/${input.projectId}/entities/${entity.id}/gpt-image-2-${crypto.randomUUID()}.png`
      const { error: uploadError } = await input.context.supabase.storage.from("creator-studio-media").upload(path, image, { contentType: "image/png", upsert: false })
      if (uploadError) throw uploadError

      const completedAt = new Date().toISOString()
      const currentMetadata = entity.metadata && typeof entity.metadata === "object" ? entity.metadata as Record<string, unknown> : {}
      let byteplusAssetId: string | null = null
      const { data: signedOutput } = await input.context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
      if (signedOutput?.signedUrl && process.env.ARK_ACCESS_KEY && process.env.ARK_SECRET_KEY) {
        try {
          byteplusAssetId = (await createBytePlusAsset({ imageUrl: signedOutput.signedUrl, name: entity.name })).assetId
        } catch (registrationError) {
          console.warn(`Could not register ${entity.name} as a BytePlus asset:`, registrationError)
        }
      }
      const referenceImages = intent.regenerate ? [path, ...existingReferences.filter((item) => item !== path)] : [...existingReferences, path]
      const metadata = {
        ...currentMetadata,
        ...(byteplusAssetId ? { byteplus_asset_id: byteplusAssetId } : {}),
        image_generation: { provider: "openai", model: "gpt-image-2", prompt, style, target: "entity", entity_id: entity.id, status: "completed", completed_at: completedAt },
      }
      const updates: Record<string, unknown> = { reference_images: referenceImages, metadata, status: entity.status || "draft" }
      if (byteplusAssetId) {
        updates.byteplus_asset_id = byteplusAssetId
        updates.byteplus_asset_uri = `asset://${byteplusAssetId}`
        updates.source_type = "byteplus_virtual_portrait"
        updates.byteplus_asset_class = "private_virtual_portrait"
        updates.verification_status = "verified"
      }
      const { error: updateError } = await input.context.supabase.from("creator_entities").update(updates).eq("id", entity.id).eq("project_id", input.projectId)
      if (updateError) throw updateError

      await input.context.supabase.from("creator_generation_jobs").insert({
        user_id: input.context.user.id,
        project_id: input.projectId,
        session_id: input.sessionId,
        type: "image",
        status: "completed",
        model: "gpt-image-2",
        provider: "openai",
        prompt,
        input_images: existingReferences,
        settings: { target: "entity", entityId: entity.id, entityType: entity.type, style },
        requires_approval: false,
        result_url: path,
        completed_at: completedAt,
      })
      return { entityId: entity.id, entityName: entity.name, path, url: signedOutput?.signedUrl, prompt }
    }))
    results.forEach((result, index) => {
      if (result.status === "fulfilled") completed.push(result.value)
      else failed.push({ entityName: batch[index].name, error: result.reason instanceof Error ? result.reason.message : "Image generation failed" })
    })
  }

  if (!completed.length) throw new Error(failed[0]?.error || "No entity reference images could be generated")
  const skippedCount = (entities || []).length - requested.length
  const details = [
    `Generated ${completed.length} separate ${style} reference image${completed.length === 1 ? "" : "s"} and saved each one to its matching card in Characters & Assets.`,
    skippedCount ? `${skippedCount} existing reference image${skippedCount === 1 ? " was" : "s were"} kept.` : "",
    failed.length ? `${failed.length} failed: ${failed.map((item) => item.entityName).join(", ")}.` : "",
  ].filter(Boolean).join(" ")
  return {
    provider: "openai",
    result: {
      type: "entity_images",
      generated: completed.length,
      failed,
      entityIds: completed.map((item) => item.entityId),
      style,
      creditsCharged,
      creditBalance,
    },
    message: {
      session_id: input.sessionId,
      role: "assistant",
      content: details,
      referenced_entity_ids: completed.map((item) => item.entityId),
      media: completed.map((item) => ({ type: "image", path: item.path, url: item.url, prompt: item.prompt, entityId: item.entityId, entityName: item.entityName, target: "entity", provider: "openai", model: "gpt-image-2" })),
    },
  }
}

async function signedMentionReferences(context: Awaited<ReturnType<typeof requireAuthenticatedProject>>, paths: string[]) {
  const urls: string[] = []
  for (const path of paths) {
    if (/^https?:\/\//i.test(path)) {
      urls.push(path)
      continue
    }
    const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)
    if (error) throw error
    urls.push(data.signedUrl)
  }
  return urls
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
