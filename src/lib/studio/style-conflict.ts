import type { AuthenticatedProjectContext } from "./server-context"
import { projectVisualStyle } from "./entity-image-workflow"
import { assertStyleMatchesPrompt, resolveShotStyle } from "./visual-style"

type Payload = Record<string, unknown>

const strings = (value: unknown): string[] => value && typeof value === "object" && !Array.isArray(value)
  ? Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === "string")
  : []
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

/**
 * Holds a Director generation whose words ask for claymation on a
 * photorealistic project, before the approval is recorded.
 *
 * Checked here rather than when the job runs because by then the proposal is
 * spent: approving marks it, a failure marks it failed, and the user would have
 * to ask the Director to prepare it again just to answer one question.
 */
export async function assertProposalStyle(context: AuthenticatedProjectContext, actionType: string, payload: unknown, styleConflict?: unknown) {
  if (styleConflict === "keep") return
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return
  const input = payload as Payload
  const projectStyle = projectVisualStyle(context.project)

  if (actionType === "generate_entity_reference_art") {
    const entityIds = ids(input.entityIds)
    const { data: entities } = entityIds.length
      ? await context.supabase.from("creator_entities").select("description").eq("project_id", context.project.id).in("id", entityIds)
      : { data: [] }
    assertStyleMatchesPrompt(projectStyle, [...strings(input.prompts), ...(entities || []).map((entity) => entity.description as string | null)])
    return
  }
  if (actionType !== "submit_generation") return

  const request = input.request && typeof input.request === "object" ? input.request as Payload : {}
  const shotIds = ids(request.shotIds)
  const shotNumbers = Array.isArray(request.shotNumbers) ? request.shotNumbers.filter((item): item is number => typeof item === "number") : []
  const episodeIds = typeof request.episodeId === "string"
    ? [request.episodeId]
    : ((await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)).data || []).map((episode) => episode.id as string)
  const { data: episodeShots } = episodeIds.length && (shotIds.length || shotNumbers.length)
    ? await context.supabase.from("creator_shots").select("id,order_index,prompt,style,metadata,referenced_entities").in("episode_id", episodeIds)
    : { data: [] }
  const shots = (episodeShots || []).filter((shot) => shotIds.includes(shot.id) || (typeof request.episodeId === "string" && shotNumbers.includes(shot.order_index + 1)))
  const entityIds = Array.from(new Set([...ids(request.mentionedEntityIds), ...shots.flatMap((shot) => ids(shot.referenced_entities))]))
  const { data: entities } = entityIds.length
    ? await context.supabase.from("creator_entities").select("id,description").eq("project_id", context.project.id).in("id", entityIds)
    : { data: [] }
  const describe = (id: string) => (entities || []).find((entity) => entity.id === id)?.description as string | null | undefined
  const written = strings(input.prompts)
  const mentioned = ids(request.mentionedEntityIds).map(describe)

  if (!shots.length) {
    assertStyleMatchesPrompt(projectStyle, [...written, ...mentioned])
    return
  }
  // Per shot, because a shot set to its own style on purpose renders in that
  // style rather than the project's.
  for (const shot of shots) {
    const metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata as Payload : {}
    const videoPrompt = typeof metadata.video_prompt === "string" ? metadata.video_prompt : null
    assertStyleMatchesPrompt(resolveShotStyle(projectStyle, shot), [
      ...written, ...mentioned, shot.prompt as string | null, videoPrompt,
      ...ids(shot.referenced_entities).map(describe),
    ])
  }
}
