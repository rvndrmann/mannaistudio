import { NextRequest, NextResponse } from "next/server"
import { ensureShotLocations } from "@/lib/studio/shot-location"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { fetchStudioFeatureFlags } from "@/lib/studio/feature-flags"
import { fetchDirectorWorkflows } from "@/lib/studio/workflows"
import { failAbandonedRuns } from "@/lib/studio/workflow-runs"
import { summarizeSpendByEpisode } from "@/lib/studio/cost-estimate"

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
    // Every shot happens somewhere, and a prompt names the location only where
    // it changes — so the shots between two exteriors carry no scene. The
    // inheritance used to run once, inside create_storyboard_batch, and the
    // entities here are made from the finished prompt sheet, which is after the
    // shots exist: at the only moment it ran there was no location to inherit.
    //
    // Repairing on the read is what makes the assets column right for a
    // storyboard already in that state, rather than only for the ones written
    // from now on. It writes nothing when there is nothing to repair, and
    // updates the rows in place so this response already carries the fix.
    if (shots?.length && entities?.length) {
      await ensureShotLocations(supabase, { shots, entities: entities as { id: string; type: string }[] })
        .catch((error) => console.warn("Could not carry shot locations forward:", error))
    }
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
    // The chat rejoins whatever this list says is still in flight, so a run
    // whose server died has to be closed here — nothing else will — and the
    // rows are corrected in place so this response already reflects it.
    await failAbandonedRuns(supabase, { projectId, userId: user.id, runs: workflowRuns || [] }).catch((error) => console.warn("Could not close abandoned Director runs:", error))
    // Generation jobs drive the storyboard's live refresh, so they travel on
    // every response rather than only when the production panels are enabled.
    const { data: baseGenerationJobs } = await supabase.from("creator_generation_jobs").select("id,workflow_run_id,shot_id,type,status,model,provider,prompt,input_images,result_url,error,settings,target_snapshot,verification,estimated_credits,credits_used,credits_refunded,created_at,completed_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50)
    // What the project has actually cost is every job it ever ran, not the
    // fifty most recent the storyboard renders, so the ledger is aggregated
    // over the whole project separately from the job list — and split by
    // episode, because the estimate beside it is built from one episode's
    // shots and the two have to be comparable.
    const { data: spendRows } = await supabase.from("creator_generation_jobs").select("type,status,estimated_credits,credits_used,credits_refunded,episode_id,billing_mode").eq("project_id", projectId)
    const spend = summarizeSpendByEpisode(spendRows || [], activeEpisode.id)
    let production = { series: [], scenes: [], referenceAssets: [], continuityIssues: [], revisions: [], generationJobs: baseGenerationJobs || [], creditAccount: null, workflowRuns: workflowRuns || [], spend } as Record<string, unknown>
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
      production = { series: series || [], scenes: scenes || [], referenceAssets: referenceAssets || [], continuityIssues: continuityIssues || [], revisions: revisions || [], generationJobs: generationJobs || [], creditAccount: creditAccount || null, workflowRuns: workflowRuns || [], spend }
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
