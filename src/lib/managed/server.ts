import "server-only"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/membership"

/**
 * Who is asking, and whether they may see this project.
 *
 * The access test is a read against `managed_projects` with RLS left on, the
 * same approach `requireAuthenticatedProject` takes: the policy already says
 * "the owner or an admin", and re-stating that as an application-side filter
 * would be a second rule to keep in step with the first. A project the caller
 * cannot reach reads back as missing, which is also what we want to tell them.
 */

export class ManagedAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 404 | 400) {
    super(message)
    this.name = "ManagedAccessError"
  }
}

export type ManagedProjectRow = {
  id: string
  user_id: string
  name: string
  service_type: string
  package_key: string
  brand_id: string | null
  studio_project_id: string | null
  brief: unknown
  offer_snapshot: unknown
  status: string
  video_count: number
  duration_seconds: number
  aspect_ratio: string
  revisions_included: number
  price_inr: number
  payment_status: string
  payment_id: string
  paid_at: string | null
  admin_note: string
  client_last_read_at: string | null
  admin_last_read_at: string | null
  created_at: string
  updated_at: string
}

export type ManagedContext = {
  supabase: SupabaseClient
  user: User
  isAdmin: boolean
  project: ManagedProjectRow
}

export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new ManagedAccessError("Sign in to continue.", 401)
  return { supabase, user }
}

export async function requireManagedProject(projectId: string): Promise<ManagedContext> {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase
    .from("managed_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle()

  if (error) {
    console.error("Managed project access check failed:", { projectId, code: error.code, message: error.message })
    throw new ManagedAccessError("Could not verify access to this project. This is usually temporary — try again.", 403)
  }
  if (!data) throw new ManagedAccessError("Project not found", 404)

  return { supabase, user, isAdmin: await isAdminUser(supabase, user.id), project: data as ManagedProjectRow }
}

export async function requireManagedAdmin(projectId: string): Promise<ManagedContext> {
  const context = await requireManagedProject(projectId)
  if (!context.isAdmin) throw new ManagedAccessError("Admins only", 403)
  return context
}

export function managedErrorStatus(error: unknown): number {
  if (error instanceof ManagedAccessError) return error.status
  return 500
}

export function managedErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

/**
 * Makes sure a `profiles` row exists before anything references it.
 *
 * `managed_projects.user_id` is a foreign key onto profiles, and a brand-new
 * Google sign-in can reach checkout before the profile trigger has been seen by
 * this request. The studio's project route does the same upsert for the same
 * reason.
 */
export async function ensureProfile(supabase: SupabaseClient, user: User) {
  try {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || "Client",
        avatar_url: user.user_metadata?.avatar_url || "",
        email: user.email || "",
      },
      { onConflict: "id" },
    )
  } catch (error) {
    console.warn("Could not upsert profile for managed order:", error)
  }
}

/**
 * Whether the managed service is open for new business.
 *
 * Read server-side at the point of sale rather than trusted from the page: the
 * nav entry disappearing when the feature is paused stops people finding it,
 * but a bookmarked brief would still reach checkout, and taking money for a
 * service that is closed is the failure worth preventing.
 */
export async function managedServiceOpen(supabase: SupabaseClient): Promise<boolean> {
  const { fetchSiteFeatures } = await import("@/lib/studio/feature-flags")
  return (await fetchSiteFeatures(supabase)).hireUs
}
