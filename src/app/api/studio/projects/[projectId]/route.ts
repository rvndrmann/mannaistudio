import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { fetchStudioFeatureFlags } from "@/lib/studio/feature-flags"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

function getDbClient(fallback: any, accessToken?: string) {
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createServiceClient()
    }
  } catch (e) {
    console.warn("Could not instantiate service client:", e)
  }
  if (accessToken && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return fallback
}

async function ownedProject(projectId: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Unauthorized")
  const { data: { session } } = await supabase.auth.getSession()
  const db = getDbClient(supabase, session?.access_token)
  // RLS grants this row to the owner and to shared team members; an explicit
  // owner filter here would hide projects that were shared with the caller.
  const { data: project, error } = await db.from("creator_projects").select("*").eq("id", projectId).single(); if (error || !project) throw new Error("Project not found")
  return { supabase, user, project, db }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId } = await params; const { supabase, user, project } = await ownedProject(projectId)
    const { data: episodes } = await supabase.from("creator_episodes").select("*").eq("project_id", projectId).order("order_index")
    const requestedEpisodeId = request.nextUrl.searchParams.get("episodeId"); const activeEpisode = episodes?.find((episode) => episode.id === requestedEpisodeId) || episodes?.[0]; if (!activeEpisode) return NextResponse.json({ error: "Project has no episodes" }, { status: 400 })
    const [features, directorWorkflows] = await Promise.all([fetchStudioFeatureFlags(supabase), fetchDirectorWorkflows(supabase)])
    const [{ data: entities }, { data: shots }, { data: chatSessions }, { data: scriptSuggestions }] = await Promise.all([supabase.from("creator_entities").select("*").eq("project_id", projectId).order("created_at"), supabase.from("creator_shots").select("*").eq("episode_id", activeEpisode.id).order("order_index"), supabase.from("creator_chat_sessions").select("*").eq("episode_id", activeEpisode.id).eq("user_id", user.id).order("updated_at", { ascending: false }), supabase.from("creator_script_suggestions").select("*").eq("episode_id", activeEpisode.id).order("created_at", { ascending: false })])
    const requestedSessionId = request.nextUrl.searchParams.get("sessionId")
    const activeSessionId = chatSessions?.find((session) => session.id === requestedSessionId)?.id || chatSessions?.[0]?.id; const [{ data: chatMessages }, { data: actionProposals }] = await Promise.all([
      activeSessionId ? supabase.from("creator_chat_messages").select("*").eq("session_id", activeSessionId).order("created_at") : Promise.resolve({ data: [] }),
      supabase.from("creator_action_proposals").select("*, creator_tool_executions(session_id)").eq("project_id", projectId).in("status", ["pending", "approved", "rejected", "executed", "failed"]).order("created_at", { ascending: false }).limit(25),
    ])
    const scopedProposals = (actionProposals || []).map((proposal) => {
      const execution = proposal.creator_tool_executions as { session_id?: string | null } | null
      const { creator_tool_executions: _execution, ...rest } = proposal
      return { ...rest, session_id: execution?.session_id ?? null }
    })
    const { data: workflowRuns } = await supabase.from("creator_workflow_runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(25)
    // Generation jobs drive the storyboard's live refresh, so they travel on
    // every response rather than only when the production panels are enabled.
    const { data: baseGenerationJobs } = await supabase.from("creator_generation_jobs").select("id,shot_id,type,status,model,provider,prompt,input_images,result_url,error,created_at,completed_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50)
    let production = { series: [], scenes: [], referenceAssets: [], continuityIssues: [], revisions: [], generationJobs: baseGenerationJobs || [], creditAccount: null, workflowRuns: workflowRuns || [] } as Record<string, unknown>
    if (features.series_hierarchy_enabled || features.continuity_checks_enabled || features.generation_jobs_enabled) {
      const [{ data: series }, { data: scenes }, { data: referenceAssets }, { data: continuityIssues }, { data: revisions }, { data: generationJobs }, { data: creditAccount }] = await Promise.all([
        supabase.from("creator_series").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("creator_scenes").select("*").eq("episode_id", activeEpisode.id).order("order_index"),
        supabase.from("creator_reference_assets").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("creator_continuity_issues").select("*").eq("project_id", projectId).eq("status", "open").order("created_at", { ascending: false }),
        supabase.from("creator_revision_requests").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(25),
        supabase.from("creator_generation_jobs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
        supabase.from("creator_credit_accounts").select("balance,reserved").eq("user_id", user.id).maybeSingle(),
      ])
      production = { series: series || [], scenes: scenes || [], referenceAssets: referenceAssets || [], continuityIssues: continuityIssues || [], revisions: revisions || [], generationJobs: generationJobs || [], creditAccount: creditAccount || null, workflowRuns: workflowRuns || [] }
    }
    return NextResponse.json({ project, episodes, activeEpisode, entities: entities || [], shots: shots || [], scriptSuggestions: scriptSuggestions || [], chatSessions: chatSessions || [], activeSessionId, chatMessages: chatMessages || [], actionProposals: scopedProposals, directorWorkflows, userId: user.id, features, production })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load project" }, { status: 404 }) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { supabase, project } = await ownedProject(projectId);
    const body = await request.json();
    const updates: Record<string, string | null> = {};
    for (const key of ["name", "description", "cover_image"]) if (body[key] !== undefined) updates[key] = body[key];
    const db = getDbClient(supabase);
    const { data, error } = await db.from("creator_projects").update(updates).eq("id", project.id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update project" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { supabase, project } = await ownedProject(projectId);
    const db = getDbClient(supabase);

    // Delete associated child records before deleting the project
    await Promise.allSettled([
      db.from("creator_shots").delete().eq("project_id", projectId),
      db.from("creator_entities").delete().eq("project_id", projectId),
      db.from("creator_episodes").delete().eq("project_id", projectId),
      db.from("creator_chat_sessions").delete().eq("project_id", projectId),
      db.from("creator_action_proposals").delete().eq("project_id", projectId),
      db.from("creator_workflow_runs").delete().eq("project_id", projectId),
      db.from("creator_generation_jobs").delete().eq("project_id", projectId),
    ]);

    const { error } = await db.from("creator_projects").delete().eq("id", project.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete project" }, { status: 400 });
  }
}
