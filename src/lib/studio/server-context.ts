import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

export class StudioAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 404) {
    super(message)
    this.name = "StudioAccessError"
  }
}

export type AuthenticatedProjectContext = {
  supabase: SupabaseClient
  user: User
  project: Record<string, unknown> & { id: string; user_id: string }
}

export async function requireAuthenticatedProject(
  projectId: string,
  client?: SupabaseClient,
): Promise<AuthenticatedProjectContext> {
  const supabase = client ?? await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new StudioAccessError("Unauthorized", 401)

  // RLS already restricts this row to the owner and anyone the project is shared
  // with, so no explicit user_id filter is applied here. Filtering by owner would
  // lock shared team members out of projects they were given access to.
  const { data: project, error } = await supabase
    .from("creator_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle()

  if (error) throw new StudioAccessError("Could not verify project access", 403)
  if (!project) throw new StudioAccessError("Project not found", 404)

  return { supabase, user, project }
}

export function studioErrorStatus(error: unknown): number {
  return error instanceof StudioAccessError ? error.status : 500
}

export function studioErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}
