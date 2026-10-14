import { NextRequest, NextResponse } from "next/server"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { MANAGED_MEDIA_BUCKET } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * What the client said about the frames sent from this production.
 *
 * Only a production opened for a managed order has any, and only an admin can
 * read the order (RLS on `managed_projects`), so for every other project this
 * answers with nothing rather than an error — the storyboard renders the same
 * either way. The frames are signed from the client copies, which are what the
 * client actually looked at; the shot may have been regenerated since.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase } = await requireAuthenticatedProject(projectId)

    const { data: orders } = await supabase
      .from("managed_projects")
      .select("id,name")
      .eq("studio_project_id", projectId)
    if (!orders?.length) return NextResponse.json({ orders: [], items: [] })

    const { data: items } = await supabase
      .from("managed_storyboard_items")
      .select("id,project_id,round,position,source_kind,studio_shot_id,studio_entity_id,title,caption,media_type,storage_path,status,feedback,responded_at,created_at")
      .in("project_id", orders.map((order) => order.id))
      .order("round", { ascending: false })
      .order("position")

    const paths = (items || []).map((item) => item.storage_path)
    const signed = paths.length
      ? await supabase.storage.from(MANAGED_MEDIA_BUCKET).createSignedUrls(paths, 3_600)
      : { data: [] }
    const urls = new Map((signed.data || []).map((entry) => [entry.path || "", entry.signedUrl || ""]))

    return NextResponse.json({
      orders,
      items: (items || []).map(({ storage_path, ...item }) => ({ ...item, url: urls.get(storage_path) || "" })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: studioErrorMessage(error, "Could not load the client's review") },
      { status: studioErrorStatus(error) },
    )
  }
}
