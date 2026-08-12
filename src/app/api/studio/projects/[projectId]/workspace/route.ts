import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function context(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: project } = await supabase.from("creator_projects").select("id").eq("id", projectId).eq("user_id", user.id).single()
  if (!project) throw new Error("Project not found")
  return { supabase, user }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params; const { supabase, user } = await context(projectId); const body = await request.json()
    if (body.action === "saveScript") {
      const { data, error } = await supabase.from("creator_episodes").update({ script_content: body.content, script_updated_at: new Date().toISOString() }).eq("id", body.episodeId).eq("project_id", projectId).select().single(); if (error) throw error; return NextResponse.json(data)
    }
    if (body.action === "createEpisode") {
      const { data: latest } = await supabase.from("creator_episodes").select("order_index").eq("project_id", projectId).order("order_index", { ascending: false }).limit(1)
      const order_index = (latest?.[0]?.order_index ?? -1) + 1
      const { data, error } = await supabase.from("creator_episodes").insert({ project_id: projectId, name: `Episode ${order_index + 1}`, description: null, script_content: null, order_index, status: "draft" }).select().single(); if (error) throw error
      const { error: sessionError } = await supabase.from("creator_chat_sessions").insert({ episode_id: data.id, user_id: user.id, title: "New Chat" }); if (sessionError) throw sessionError
      return NextResponse.json(data)
    }
    if (body.action === "createChatSession") {
      const { data: episode } = await supabase.from("creator_episodes").select("id").eq("id", body.episodeId).eq("project_id", projectId).maybeSingle()
      if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 })
      const { data, error } = await supabase.from("creator_chat_sessions").insert({ episode_id: body.episodeId, user_id: user.id, title: body.title || "New Chat", model: body.model || null }).select().single()
      if (error) throw error
      return NextResponse.json(data)
    }
    if (body.action === "createSuggestion") {
      const { data, error } = await supabase.from("creator_script_suggestions").insert({ episode_id: body.episodeId, content: body.content, summary: body.summary || "AI Director draft update" }).select().single(); if (error) throw error; return NextResponse.json(data)
    }
    if (body.action === "reviewSuggestion") {
      const { data: suggestion, error } = await supabase.from("creator_script_suggestions").update({ status: body.status }).eq("id", body.suggestionId).select().single(); if (error) throw error
      if (body.status === "accepted") { const { error: episodeError } = await supabase.from("creator_episodes").update({ script_content: suggestion.content, script_updated_at: new Date().toISOString() }).eq("id", suggestion.episode_id); if (episodeError) throw episodeError }
      return NextResponse.json(suggestion)
    }
    if (body.action === "saveAsset") {
      const payload = {
        type: body.asset.type,
        name: body.asset.name,
        handle: body.asset.handle || body.asset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: body.asset.description || null,
        reference_images: body.asset.reference_images || [],
        // Which saved image represents this entity during generation. Only
        // honoured when it is one of the entity's own images.
        primary_reference_image: (body.asset.reference_images || []).includes(body.asset.primary_reference_image) ? body.asset.primary_reference_image : null,
        voice_id: body.asset.voice_id || null,
        status: body.asset.status || "draft",
        character_type: body.asset.character_type || "ai_human",
        source_type: body.asset.source_type || (body.asset.byteplus_asset_id ? "byteplus_virtual_portrait" : "external_untrusted"),
        byteplus_asset_class: body.asset.byteplus_asset_class || (body.asset.byteplus_asset_id ? "private_virtual_portrait" : "untrusted_external"),
        byteplus_asset_id: body.asset.byteplus_asset_id || body.asset.metadata?.byteplus_asset_id || null,
        byteplus_asset_uri: body.asset.byteplus_asset_uri || (body.asset.byteplus_asset_id ? `asset://${body.asset.byteplus_asset_id}` : null),
        verification_status: body.asset.verification_status || (body.asset.byteplus_asset_id ? "verified" : "unverified"),
        provenance: body.asset.provenance || {},
        metadata: body.asset.metadata || {},
      }
      const query = body.asset.id ? supabase.from("creator_entities").update(payload).eq("id", body.asset.id).eq("project_id", projectId) : supabase.from("creator_entities").insert({ ...payload, project_id: projectId })
      const { data, error } = await query.select().single(); if (error) throw error; return NextResponse.json(data)
    }
    if (body.action === "deleteAsset") { const { error } = await supabase.from("creator_entities").delete().eq("id", body.id).eq("project_id", projectId); if (error) throw error; return NextResponse.json({ success: true }) }
    if (body.action === "saveShot") {
      const payload: Record<string, unknown> = { title: body.shot.title, prompt: body.shot.prompt || null, duration_seconds: body.shot.duration_seconds || 4, aspect_ratio: body.shot.aspect_ratio || "9:16", resolution: body.shot.resolution || "720p", model: body.shot.model || "Cinematic", referenced_entities: body.shot.entityIds || [] }
      // Carries cast_curated, which marks a shot whose asset list the user set
      // by hand so it is never re-derived from the prompt underneath them.
      if (body.shot.metadata) payload.metadata = body.shot.metadata
      const query = body.shot.id ? supabase.from("creator_shots").update(payload).eq("id", body.shot.id).eq("episode_id", body.episodeId) : supabase.from("creator_shots").insert({ ...payload, episode_id: body.episodeId, order_index: body.orderIndex || 0 })
      const { data, error } = await query.select().single(); if (error) throw error
      await supabase.from("creator_shot_assets").delete().eq("shot_id", data.id)
      if (body.shot.entityIds?.length) await supabase.from("creator_shot_assets").insert(body.shot.entityIds.map((entity_id: string, order_index: number) => ({ shot_id: data.id, entity_id, order_index })))
      return NextResponse.json(data)
    }
    if (body.action === "updateShotChosenMedia") {
      const updates: Record<string, unknown> = {}
      if (body.mediaType === "image") {
        updates.keyframe_image = body.mediaUrl
      } else {
        updates.video_url = body.mediaUrl
        updates.video_status = "completed"
      }
      const { data, error } = await supabase.from("creator_shots").update(updates).eq("id", body.shotId).select().single()
      if (error) throw error
      return NextResponse.json(data)
    }
    if (body.action === "deleteJob") {
      const { error } = await supabase.from("creator_generation_jobs").delete().eq("id", body.jobId).eq("project_id", projectId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (body.action === "saveProjectSettings") {
      const selectedAspect = body.settings.aspectRatio || body.settings.canvasSpec?.split(" · ")[0] || "9:16"
      const selectedStyle = body.settings.visualStyle || "Realistic - 3D CG"
      const projectName = typeof body.settings.projectName === "string" ? body.settings.projectName.trim().slice(0, 160) : ""
      const { data: projectRecord } = await supabase.from("creator_projects").select("metadata").eq("id", projectId).single()
      const currentMeta = (projectRecord?.metadata as Record<string, unknown>) || {}
      const currentEpisodeWorkflows = (currentMeta.episode_workflows as Record<string, unknown> | undefined) || {}
      const workflowId = typeof body.settings.workflow === "string" ? body.settings.workflow : currentMeta.default_workflow_id
      const episodeId = typeof body.settings.episodeId === "string" ? body.settings.episodeId : null
      const workflowApplyMode = body.settings.workflowApplyMode === "episode" ? "episode" : "project_default"
      const nextEpisodeWorkflows = episodeId ? { ...currentEpisodeWorkflows, [episodeId]: workflowId } : currentEpisodeWorkflows
      const updates = {
        ...(projectName ? { name: projectName } : {}),
        default_aspect: selectedAspect,
        default_style: selectedStyle,
        metadata: {
          ...currentMeta,
          basic_settings: body.settings,
          default_workflow_id: workflowApplyMode === "project_default" ? workflowId : currentMeta.default_workflow_id || workflowId,
          episode_workflows: nextEpisodeWorkflows,
        },
      }
      const { data, error } = await supabase.from("creator_projects").update(updates).eq("id", projectId).select().single()
      if (error) throw error

      // Update default aspect ratio for all shots in the project
      const { data: episodes } = await supabase.from("creator_episodes").select("id").eq("project_id", projectId)
      if (episodes && episodes.length > 0) {
        const episodeIds = episodes.map((e) => e.id)
        await supabase.from("creator_shots").update({ aspect_ratio: selectedAspect }).in("episode_id", episodeIds)
      }

      return NextResponse.json(data)
    }
    if (body.action === "reorderShots") { await Promise.all((body.ids as string[]).map((id, order_index) => supabase.from("creator_shots").update({ order_index }).eq("id", id))); return NextResponse.json({ success: true }) }
    if (body.action === "saveMediaDraft") {
      const { data: current, error: currentError } = await supabase.from("creator_shots").select("metadata").eq("id", body.shotId).single(); if (currentError) throw currentError
      const metadata = { ...(current?.metadata || {}), [`${body.type}_generation`]: { prompt: body.prompt, model: body.model, reference_images: body.referenceImages || [], status: "requested", requested_at: new Date().toISOString() } }
      const updates = body.type === "video" ? { metadata, video_status: "generating" } : { metadata }
      const { data, error } = await supabase.from("creator_shots").update(updates).eq("id", body.shotId).select().single(); if (error) throw error; return NextResponse.json(data)
    }
    if (body.action === "chat") { const { data: sessions } = await supabase.from("creator_chat_sessions").select("id").eq("episode_id", body.episodeId).eq("user_id", user.id).limit(1); let sessionId = sessions?.[0]?.id; if (!sessionId) { const { data, error } = await supabase.from("creator_chat_sessions").insert({ episode_id: body.episodeId, user_id: user.id, title: "Project direction" }).select("id").single(); if (error) throw error; sessionId = data.id } const { data, error } = await supabase.from("creator_chat_messages").insert({ session_id: sessionId, role: "user", content: body.content }).select().single(); if (error) throw error; return NextResponse.json(data) }
    return NextResponse.json({ error: "Unsupported workspace action" }, { status: 400 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update workspace" }, { status: 400 }) }
}
