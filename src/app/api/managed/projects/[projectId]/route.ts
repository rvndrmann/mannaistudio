import { NextRequest, NextResponse } from "next/server"
import { managedErrorMessage, managedErrorStatus, requireManagedProject } from "@/lib/managed/server"
import { parseManagedBrief } from "@/lib/managed-brief"

export const dynamic = "force-dynamic"

/**
 * Everything one managed project needs to render, in one request.
 *
 * The client's page shows the pipeline, the deliverables with their versions,
 * the conversation and the revision notes at once, and fetching those as four
 * calls made the page paint in four stages. RLS decides what comes back:
 * the owner and admins pass, anyone else gets a 404 from
 * `requireManagedProject` before any of this runs.
 *
 * Nothing here reaches into `creator_*`. `studio_project_id` is returned only
 * to an admin, because to a client it is an internal reference they can do
 * nothing with and should not be shown.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, project, isAdmin, user } = await requireManagedProject(projectId)

    const [{ data: deliverables }, { data: versions }, { data: messages }, { data: comments }] = await Promise.all([
      supabase.from("managed_deliverables").select("*").eq("project_id", projectId).order("position"),
      supabase.from("managed_deliverable_versions").select("*").eq("project_id", projectId).order("version_number"),
      supabase.from("managed_messages").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("managed_revision_comments").select("*").eq("project_id", projectId).order("created_at"),
    ])

    // Reading it is what marks it read; a separate "mark read" call would fire
    // on the same page load and cost a round trip to say the same thing.
    await supabase.rpc("mark_managed_project_read", { p_project_id: projectId }).then(
      () => undefined,
      () => undefined,
    )

    return NextResponse.json({
      project: {
        ...project,
        brief: parseManagedBrief(project.brief),
        // Internal reference, admin eyes only.
        studio_project_id: isAdmin ? project.studio_project_id : null,
        admin_note: isAdmin ? project.admin_note : "",
      },
      deliverables: deliverables || [],
      versions: versions || [],
      messages: messages || [],
      comments: comments || [],
      viewer: { id: user.id, isAdmin, isOwner: project.user_id === user.id },
    })
  } catch (error) {
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not load this project") },
      { status: managedErrorStatus(error) },
    )
  }
}
