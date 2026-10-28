import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { createMediaPass, MEDIA_PASS_SECONDS } from "./media-pass"

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null

/** The first reference picture a character or asset has, primary first. */
function entityImage(entity: Row) {
  const references = Array.isArray(entity.reference_images) ? entity.reference_images : []
  return text(entity.primary_reference_image) || text(references[0])
}

/**
 * What the storyboard gallery draws. Media are storage paths, not URLs: the
 * page loads each one from `mediaBase` + path, where `/api/mcp/media` checks
 * the pass and the path's owner before signing it. One short pass instead of a
 * signed URL per file keeps this small, because hosts show it to the model as
 * well as to the page.
 */
export function buildStoryboardGallery(context: AuthenticatedProjectContext, data: Row, studioOrigin: string) {
  const project = (data.project || {}) as Row
  const episode = (data.activeEpisode || {}) as Row
  const shots = ((data.shots || []) as Row[]).slice().sort((a, b) => Number(a.order_index) - Number(b.order_index))
  const entities = (data.entities || []) as Row[]
  const finalCut = (episode.final_cut || null) as Row | null
  const finalCutPath = finalCut ? text(finalCut.path) : null
  return {
    view: "storyboard" as const,
    note: "The user is shown these as a gallery when their chat app supports it. To show one picture in the chat otherwise, pass its path to studio_view_media.",
    project: { id: project.id, name: text(project.name), style: text(project.default_style), aspect: text(project.default_aspect) },
    episode: { id: episode.id, name: text(episode.name) },
    studioUrl: project.id ? `${studioOrigin}/studio/project/${project.id}` : null,
    shots: shots.map((shot) => ({
      number: Number(shot.order_index) + 1, title: text(shot.title), description: text(shot.description),
      image: text(shot.keyframe_image), video: text(shot.video_url),
      videoStatus: text(shot.video_status), durationSeconds: typeof shot.duration_seconds === "number" ? shot.duration_seconds : null,
    })),
    cast: entities.map((entity) => ({ name: text(entity.name), kind: text(entity.kind) || text(entity.type), image: entityImage(entity) })),
    finalCut: finalCutPath ? { path: finalCutPath, filename: text(finalCut?.filename), durationSeconds: finalCut?.duration_seconds ?? null } : null,
    mediaBase: `${studioOrigin}/api/mcp/media?pass=${createMediaPass(context.user.id)}&path=`,
    expiresInSeconds: MEDIA_PASS_SECONDS,
  }
}
