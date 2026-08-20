import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { StudioAccessError } from "@/lib/studio/server-context"
import { MEDIA_BUCKET, QUICK_MEDIA_FOLDER, type QuickHistoryItem } from "@/lib/studio/quick-media"

/**
 * Generating outside a production.
 *
 * The storyboard path exists to make a shot: it resolves the project's look,
 * the cast a prompt mentions, the camera package, the episode the credits
 * belong to, and it writes the result back onto a shot row. None of that
 * applies to someone who wants one picture. This module is the small amount of
 * shared ground the two standalone routes need — auth without a project, a
 * storage path with nowhere to put a project id, and the prompt composed from
 * what the user actually typed.
 *
 * What is deliberately *not* here: style DNA, entity mentions, camera packages.
 * A standalone prompt reaches the model close to as written. Quietly appending
 * a look block would make these pages produce different pictures from the same
 * prompt than the provider's own site does, which is the one thing someone
 * reaching for a bare generator will notice.
 */

export { MEDIA_BUCKET, QUICK_MEDIA_FOLDER } from "@/lib/studio/quick-media"
export type { QuickHistoryItem } from "@/lib/studio/quick-media"

export type QuickContext = { supabase: SupabaseClient; user: User }

/**
 * The caller, with no project to check.
 *
 * `requireAuthenticatedProject` is the studio's usual gate, and every one of
 * its checks is about a project. Standalone work has none, so it needs its own
 * entry point rather than a fabricated project to check against.
 */
export async function requireAuthenticatedUser(client?: SupabaseClient): Promise<QuickContext> {
  const supabase = client ?? await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new StudioAccessError("Unauthorized", 401)
  return { supabase, user }
}

/**
 * Where a standalone result is stored.
 *
 * Media lives at `{owner}/{project}/…`, and the bucket's read policy resolves
 * the second segment as a project id to decide who else may see the file. A
 * standalone generation has no project, so the segment is a literal that
 * matches no project row — the owner-only policy is then the only one that
 * grants it, which is exactly the intent: nobody is sharing these.
 */
export function quickStoragePath(input: {
  userId: string
  provider: string
  kind: "image" | "video"
  extension: string
}): string {
  const extension = input.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"
  return `${input.userId}/${QUICK_MEDIA_FOLDER}/${input.provider}-${input.kind}-${randomUUID()}.${extension}`
}

/** The file extension for what a provider actually returned. */
export function extensionForContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg"
  if (contentType.includes("webp")) return "webp"
  if (contentType.includes("mp4")) return "mp4"
  return "png"
}

/**
 * The prompt as sent to the provider.
 *
 * One line is added and nothing else: the aspect ratio, which every provider
 * here takes as a separate parameter but several ignore unless the prompt
 * agrees with it. The user's own words are left first and unedited.
 */
export function composeQuickPrompt(prompt: string, aspectRatio: string): string {
  const text = prompt.trim()
  if (!aspectRatio) return text
  return `${text}\n\nRequired composition: ${aspectRatio}.`
}

/** True for a reference that is already a URL or a provider-held asset id. */
export function isDirectReference(path: string): boolean {
  return /^https?:\/\//i.test(path) || /^asset:\/\//i.test(path) || /^asset-[a-z0-9-]+$/i.test(path)
}

/** Signs storage paths so a provider can fetch them; passes URLs through. */
export async function signReferenceUrls(context: QuickContext, paths: string[]): Promise<string[]> {
  const urls: string[] = []
  for (const path of paths) {
    if (isDirectReference(path)) {
      urls.push(path)
      continue
    }
    const { data, error } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60)
    if (error) throw error
    urls.push(data.signedUrl)
  }
  return urls
}

/**
 * A reference the caller does not own.
 *
 * The client sends storage paths it uploaded, and nothing stops it sending
 * somebody else's. Storage RLS would refuse to sign one — but only after the
 * credits were taken, which turns a rejected reference into a charge for
 * nothing. Ownership is the first path segment, so it is cheap to check first.
 */
export function foreignReferences(userId: string, paths: string[]): string[] {
  return paths.filter((path) => !isDirectReference(path) && !path.startsWith(`${userId}/`))
}

/**
 * One history row as the page needs it.
 *
 * `credits_used` is the charge that stuck; a refunded failure reports zero
 * rather than the amount it briefly cost, because that is what the balance
 * shows and a history that disagrees with the balance reads as a double charge.
 */
export function toHistoryItem(job: Record<string, unknown>): QuickHistoryItem {
  const used = Number(job.credits_used || 0)
  const refunded = Number(job.credits_refunded || 0)
  const settings = job.settings && typeof job.settings === "object" ? job.settings as Record<string, unknown> : {}
  return {
    id: String(job.id),
    type: job.type === "video" ? "video" : "image",
    status: String(job.status || "queued"),
    prompt: typeof job.prompt === "string" ? job.prompt : "",
    model: typeof job.model === "string" ? job.model : "",
    provider: typeof job.provider === "string" ? job.provider : "",
    resultPath: typeof job.result_url === "string" && job.result_url ? job.result_url : null,
    error: typeof job.error === "string" && job.error ? job.error : null,
    creditsCharged: Math.max(0, used - refunded),
    billingMode: typeof job.billing_mode === "string" ? job.billing_mode : "credits",
    settings,
    createdAt: String(job.created_at || ""),
    completedAt: typeof job.completed_at === "string" ? job.completed_at : null,
  }
}
