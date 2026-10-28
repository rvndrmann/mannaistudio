import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"

const MEDIA_BUCKET = "creator-studio-media"
export const GALLERY_LINK_SECONDS = 60 * 60

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null

/**
 * Signed URLs for many stored files in one storage call.
 *
 * Same rule as the media route: a path is signed only when it sits under the
 * caller's own prefix, because an external token may resolve to a client RLS
 * does not constrain. Anything else, and anything that fails to sign, is left
 * out rather than failing the whole gallery. A path that is already a URL is
 * passed through.
 */
export async function signOwnMedia(context: AuthenticatedProjectContext, paths: Array<string | null>) {
  const signed = new Map<string, string>()
  const own = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  for (const path of own) if (/^https:\/\//i.test(path)) signed.set(path, path)
  const stored = own.filter((path) => !signed.has(path) && !path.includes("..") && path.startsWith(`${context.user.id}/`))
  if (!stored.length) return signed
  const { data, error } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrls(stored, GALLERY_LINK_SECONDS)
  if (error) throw new Error(`Could not sign this storyboard's media: ${error.message}`)
  for (const item of data || []) if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl)
  return signed
}

/** The first reference picture a character or asset has, primary first. */
function entityImage(entity: Row) {
  const references = Array.isArray(entity.reference_images) ? entity.reference_images : []
  return text(entity.primary_reference_image) || text(references[0])
}

/**
 * What the storyboard gallery draws, and a short account of it for the model.
 *
 * The model gets paths and titles, not signed URLs: they are long, expire, and
 * are only useful to the page. `studio_view_media` takes the paths.
 */
export async function buildStoryboardGallery(context: AuthenticatedProjectContext, data: Row, studioOrigin: string) {
  const project = (data.project || {}) as Row
  const episode = (data.activeEpisode || {}) as Row
  const shots = ((data.shots || []) as Row[]).slice().sort((a, b) => Number(a.order_index) - Number(b.order_index))
  const entities = (data.entities || []) as Row[]
  const finalCut = (episode.final_cut || null) as Row | null
  const finalCutPath = finalCut ? text(finalCut.path) : null

  const urls = await signOwnMedia(context, [
    ...shots.flatMap((shot) => [text(shot.keyframe_image), text(shot.video_url)]),
    ...entities.map(entityImage), finalCutPath,
  ])
  const url = (path: string | null) => (path && urls.get(path)) || null

  const gallery = {
    view: "storyboard" as const,
    project: { id: project.id, name: text(project.name), style: text(project.default_style), aspect: text(project.default_aspect) },
    episode: { id: episode.id, name: text(episode.name) },
    studioUrl: project.id ? `${studioOrigin}/studio/project/${project.id}` : null,
    shots: shots.map((shot) => ({
      number: Number(shot.order_index) + 1, title: text(shot.title), description: text(shot.description),
      image: url(text(shot.keyframe_image)), video: url(text(shot.video_url)),
      videoStatus: text(shot.video_status), durationSeconds: typeof shot.duration_seconds === "number" ? shot.duration_seconds : null,
    })),
    cast: entities.map((entity) => ({ id: entity.id, name: text(entity.name), kind: text(entity.kind) || text(entity.type), image: url(entityImage(entity)) })),
    finalCut: finalCutPath ? { url: url(finalCutPath), filename: text(finalCut?.filename), durationSeconds: finalCut?.duration_seconds ?? null } : null,
    expiresInSeconds: GALLERY_LINK_SECONDS,
  }
  const summary = {
    project: gallery.project, episode: gallery.episode,
    note: "The user is shown these as a gallery when their chat app supports it. To show one picture in the chat otherwise, pass its path to studio_view_media.",
    shots: shots.map((shot) => ({
      shotNumber: Number(shot.order_index) + 1, title: text(shot.title),
      framePath: text(shot.keyframe_image), clipPath: text(shot.video_url), clipStatus: text(shot.video_status),
    })),
    cast: entities.map((entity) => ({ name: text(entity.name), kind: text(entity.kind) || text(entity.type), imagePath: entityImage(entity) })),
    finalCutPath,
  }
  return { gallery, summary }
}
