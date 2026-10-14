import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { managedErrorMessage, managedErrorStatus, requireManagedAdmin } from "@/lib/managed/server"
import { MANAGED_MEDIA_BUCKET, managedStoryboardPrefix } from "@/lib/managed-production"
import { entityPrimaryReference } from "@/lib/studio/entity-mentions"

export const dynamic = "force-dynamic"

/**
 * Storyboard review, from the producer's side.
 *
 * GET lists what in the order's Studio production could be sent — each shot's
 * keyframe and clip, and each asset's chosen image — with the client's latest
 * verdict on it, so a producer can see at a glance which frames are signed off
 * and which came back with changes.
 *
 * POST sends a round. The browser names shots and assets, never file paths:
 * the source is read back from the production here, so this URL cannot be used
 * to copy an arbitrary object into a client's folder. Each file is then copied
 * into `managed/{id}/storyboard/` — the same rule as publishing a cut — and the
 * database function records the round.
 */

type Kind = "keyframe" | "clip" | "asset"

type Candidate = {
  key: string
  kind: Kind
  shotId: string | null
  entityId: string | null
  title: string
  group: string
  sourcePath: string
  mediaType: "image" | "video"
}

const sendSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(["keyframe", "clip", "asset"]),
    shotId: z.string().uuid().optional(),
    entityId: z.string().uuid().optional(),
    caption: z.string().trim().max(1_000).default(""),
  }).strict()).min(1).max(40),
  note: z.string().trim().max(2_000).default(""),
}).strict()

function isStoragePath(path: unknown): path is string {
  return typeof path === "string" && path.trim().length > 0 && !/^https?:\/\//i.test(path) && !path.includes("..")
}

function mediaTypeOf(path: string): "image" | "video" {
  return /\.(mp4|mov|webm|m4v)$/i.test(path) ? "video" : "image"
}

async function loadCandidates(
  supabase: Awaited<ReturnType<typeof requireManagedAdmin>>["supabase"],
  studioProjectId: string,
): Promise<Candidate[]> {
  const [{ data: episodes }, { data: entities }] = await Promise.all([
    supabase.from("creator_episodes").select("id,name,order_index").eq("project_id", studioProjectId).order("order_index"),
    supabase
      .from("creator_entities")
      .select("id,name,type,reference_images,primary_reference_image")
      .eq("project_id", studioProjectId)
      .order("created_at"),
  ])

  const candidates: Candidate[] = []
  const episodeIds = (episodes || []).map((episode) => episode.id)
  if (episodeIds.length) {
    const { data: shots } = await supabase
      .from("creator_shots")
      .select("id,title,keyframe_image,video_url,order_index,episode_id")
      .in("episode_id", episodeIds)
      .order("order_index")

    const episodeOrder = new Map((episodes || []).map((episode, index) => [episode.id, index]))
    const episodeName = new Map((episodes || []).map((episode) => [episode.id, episode.name as string]))
    const ordered = [...(shots || [])].sort((a, b) =>
      (episodeOrder.get(a.episode_id) ?? 0) - (episodeOrder.get(b.episode_id) ?? 0) || a.order_index - b.order_index)

    for (const shot of ordered) {
      const title = `Shot ${shot.order_index + 1}${shot.title ? ` — ${shot.title}` : ""}`
      const group = (episodes || []).length > 1 ? episodeName.get(shot.episode_id) || "Episode" : "Storyboard"
      if (isStoragePath(shot.keyframe_image)) {
        candidates.push({
          key: `keyframe:${shot.id}`, kind: "keyframe", shotId: shot.id, entityId: null,
          title, group, sourcePath: shot.keyframe_image, mediaType: mediaTypeOf(shot.keyframe_image),
        })
      }
      if (isStoragePath(shot.video_url)) {
        candidates.push({
          key: `clip:${shot.id}`, kind: "clip", shotId: shot.id, entityId: null,
          title, group, sourcePath: shot.video_url, mediaType: "video",
        })
      }
    }
  }

  for (const entity of entities || []) {
    const image = entityPrimaryReference(entity)
    if (!isStoragePath(image)) continue
    candidates.push({
      key: `asset:${entity.id}`, kind: "asset", shotId: null, entityId: entity.id,
      title: entity.name || "Asset", group: "Characters & assets", sourcePath: image, mediaType: mediaTypeOf(image),
    })
  }

  return candidates
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, project } = await requireManagedAdmin(projectId)
    if (!project.studio_project_id) return NextResponse.json({ studioProjectId: null, candidates: [] })

    const candidates = await loadCandidates(supabase, project.studio_project_id)

    // The client's most recent word on each source, newest round first.
    const { data: sent } = await supabase
      .from("managed_storyboard_items")
      .select("source_kind,studio_shot_id,studio_entity_id,status,round,feedback")
      .eq("project_id", projectId)
      .order("round", { ascending: false })
    const latest = new Map<string, { status: string; round: number; feedback: string }>()
    for (const item of sent || []) {
      const key = `${item.source_kind}:${item.studio_shot_id || item.studio_entity_id}`
      if (!latest.has(key)) latest.set(key, { status: item.status, round: item.round, feedback: item.feedback })
    }

    const signed = candidates.length
      ? await supabase.storage.from(MANAGED_MEDIA_BUCKET).createSignedUrls(candidates.map((candidate) => candidate.sourcePath), 3_600)
      : { data: [] }
    const urls = new Map((signed.data || []).map((entry) => [entry.path || "", entry.signedUrl || ""]))

    return NextResponse.json({
      studioProjectId: project.studio_project_id,
      candidates: candidates.map(({ sourcePath, ...candidate }) => ({
        ...candidate,
        url: urls.get(sourcePath) || "",
        lastReview: latest.get(candidate.key) || null,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not list the storyboard") },
      { status: managedErrorStatus(error) },
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const copied: string[] = []
  const admin = createServiceClient()
  const storage = admin.storage.from(MANAGED_MEDIA_BUCKET)
  try {
    const { projectId } = await params
    const { supabase, project } = await requireManagedAdmin(projectId)
    const input = sendSchema.parse(await request.json())
    if (!project.studio_project_id) {
      return NextResponse.json({ error: "Open the Creator Studio production for this order first." }, { status: 400 })
    }

    const candidates = new Map(
      (await loadCandidates(supabase, project.studio_project_id)).map((candidate) => [candidate.key, candidate]),
    )

    const items = []
    const seen = new Set<string>()
    for (const requested of input.items) {
      const key = `${requested.kind}:${requested.kind === "asset" ? requested.entityId : requested.shotId}`
      if (seen.has(key)) continue
      seen.add(key)
      const candidate = candidates.get(key)
      if (!candidate) {
        return NextResponse.json({ error: "One of those frames is no longer in the production. Refresh and try again." }, { status: 404 })
      }

      const extension = candidate.sourcePath.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)
        || (candidate.mediaType === "video" ? "mp4" : "png")
      const destination = `${managedStoryboardPrefix(projectId)}/${randomUUID()}.${extension}`
      const { error: copyError } = await storage.copy(candidate.sourcePath, destination)
      if (copyError) throw new Error(`Could not copy "${candidate.title}": ${copyError.message}`)
      copied.push(destination)

      items.push({
        kind: candidate.kind,
        shotId: candidate.shotId,
        entityId: candidate.entityId,
        title: candidate.kind === "clip" ? `${candidate.title} (clip)` : candidate.title,
        caption: requested.caption,
        path: destination,
        mediaType: candidate.mediaType,
      })
    }

    const { data: round, error } = await supabase.rpc("admin_managed_send_storyboard", {
      p_project_id: projectId,
      p_items: items,
      p_note: input.note,
    })
    if (error) throw new Error(error.message)

    return NextResponse.json({ round, sent: items.length })
  } catch (error) {
    // Nothing was recorded, so the copies are files no row points at; leaving
    // them would put frames in a client's folder that nobody chose to send.
    if (copied.length) await storage.remove(copied).catch(() => undefined)
    if (error instanceof ZodError) return NextResponse.json({ error: "Pick at least one frame to send." }, { status: 400 })
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not send the storyboard") },
      { status: managedErrorStatus(error) === 500 ? 400 : managedErrorStatus(error) },
    )
  }
}
