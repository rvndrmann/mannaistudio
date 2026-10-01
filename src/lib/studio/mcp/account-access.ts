import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { StudioAccessError } from "@/lib/studio/server-context"

/** Reject nested identifiers from another project, even if RLS allows sharing. */
export async function requireMcpEpisode(context: AuthenticatedProjectContext, episodeId?: string) {
  let query = context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
  if (episodeId) query = query.eq("id", episodeId)
  const { data, error } = await query.order("order_index", { ascending: true }).limit(1).maybeSingle()
  if (error || !data) throw new StudioAccessError("Episode not found", 404)
  return data.id as string
}
export async function requireMcpSession(context: AuthenticatedProjectContext, episodeId: string, sessionId: string) {
  const { data, error } = await context.supabase.from("creator_chat_sessions").select("id")
    .eq("id", sessionId).eq("episode_id", episodeId).eq("user_id", context.user.id).maybeSingle()
  if (error || !data) throw new StudioAccessError("Chat session not found", 404)
}
