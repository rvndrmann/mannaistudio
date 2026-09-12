import { NextRequest, NextResponse } from "next/server"
import { managedErrorMessage, managedErrorStatus, requireManagedAdmin } from "@/lib/managed/server"
import { MANAGED_MEDIA_BUCKET } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

/**
 * What is available to send to the client.
 *
 * Finished shot videos from the order's linked production, plus anything the
 * admin has uploaded into the order's own folder — which is how a browser-side
 * timeline export, stitched from several shots, gets published: it is saved to
 * disk by the studio's export modal, then re-uploaded here as the finished cut.
 *
 * Signed for preview so a producer can watch a clip before handing it over.
 * These are internal paths; the response goes to an admin only, and nothing in
 * it is ever written to a managed row — publishing copies the bytes first.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, project } = await requireManagedAdmin(projectId)

    const clips: Array<{ path: string; label: string; source: "studio" | "upload"; durationSeconds: number | null }> = []

    if (project.studio_project_id) {
      const { data: episodes } = await supabase
        .from("creator_episodes")
        .select("id,name,order_index")
        .eq("project_id", project.studio_project_id)
        .order("order_index")

      const episodeIds = (episodes || []).map((episode) => episode.id)
      if (episodeIds.length) {
        const { data: shots } = await supabase
          .from("creator_shots")
          .select("id,title,video_url,duration_seconds,order_index,episode_id")
          .in("episode_id", episodeIds)
          .not("video_url", "is", null)
          .order("order_index")

        const episodeName = new Map((episodes || []).map((episode) => [episode.id, episode.name]))
        for (const shot of shots || []) {
          if (!shot.video_url) continue
          clips.push({
            path: shot.video_url,
            label: `${episodeName.get(shot.episode_id) || "Episode"} — ${shot.title || `Shot ${shot.order_index + 1}`}`,
            source: "studio",
            durationSeconds: typeof shot.duration_seconds === "number" ? shot.duration_seconds : null,
          })
        }
      }
    }

    const { data: uploaded } = await supabase.storage
      .from(MANAGED_MEDIA_BUCKET)
      .list(`managed/${projectId}/uploads`, { limit: 100, sortBy: { column: "created_at", order: "desc" } })

    for (const file of uploaded || []) {
      if (!file.name) continue
      clips.push({
        path: `managed/${projectId}/uploads/${file.name}`,
        label: file.name,
        source: "upload",
        durationSeconds: null,
      })
    }

    const signed = clips.length
      ? await supabase.storage.from(MANAGED_MEDIA_BUCKET).createSignedUrls(clips.map((clip) => clip.path), 3_600)
      : { data: [] }
    const urls = new Map((signed.data || []).map((entry) => [entry.path || "", entry.signedUrl || ""]))

    return NextResponse.json({
      studioProjectId: project.studio_project_id,
      clips: clips.map((clip) => ({ ...clip, url: urls.get(clip.path) || "" })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not list what is ready to send") },
      { status: managedErrorStatus(error) },
    )
  }
}
