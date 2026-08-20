import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { StudioAccessError } from "@/lib/studio/server-context"
import { refundGenerationCredits } from "@/lib/studio/credits"
import { MEDIA_BUCKET, QUICK_GENERATIONS_TABLE, QUICK_MEDIA_FOLDER, type QuickHistoryItem } from "@/lib/studio/quick-media"

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

export { MEDIA_BUCKET, QUICK_MEDIA_FOLDER, QUICK_GENERATIONS_TABLE } from "@/lib/studio/quick-media"
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
export function toHistoryItem(row: Record<string, unknown>): QuickHistoryItem {
  const used = Number(row.credits_used || 0)
  const refunded = Number(row.credits_refunded || 0)
  const settings = row.settings && typeof row.settings === "object" ? row.settings as Record<string, unknown> : {}
  return {
    id: String(row.id),
    type: row.type === "video" ? "video" : "image",
    status: String(row.status || "queued"),
    prompt: typeof row.prompt === "string" ? row.prompt : "",
    model: typeof row.model === "string" ? row.model : "",
    provider: typeof row.provider === "string" ? row.provider : "",
    resultPath: typeof row.result_path === "string" && row.result_path ? row.result_path : null,
    error: typeof row.error === "string" && row.error ? row.error : null,
    creditsCharged: Math.max(0, used - refunded),
    billingMode: typeof row.billing_mode === "string" ? row.billing_mode : "credits",
    settings,
    createdAt: String(row.created_at || ""),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  }
}

/**
 * Gives back what a failed generation charged, and records that it did.
 *
 * The refund RPC belongs to the storyboard job table — its `p_job_id` writes
 * `credits_refunded` back onto a row there — so a quick generation passes no
 * job id and keeps its own tally instead. Idempotency does not depend on that
 * argument in any case: it comes from the refund key, which is why the key is
 * derived from the row's id rather than being a fresh uuid each attempt.
 *
 * A BYOK generation never reaches here with anything to give back. Nothing was
 * taken, so nothing can be returned — the cost of that failure sat with the
 * provider and no refund here can reach it.
 */
export async function refundQuickGeneration(input: {
  context: QuickContext
  /**
   * Idempotency key, and the reason this is a parameter rather than derived
   * from the row: credits are taken before the row is written, so a failed
   * insert has to be refundable with no row to name. The caller mints a
   * per-request key up front and reuses it; a path that can be retried against
   * an existing row (the stalled-job reconcile) passes a key derived from that
   * row's id instead, so polling twice cannot refund twice.
   */
  refundKey: string
  amount: number
  description: string
  /** Present once the row exists, so the refund can be recorded on it. */
  generationId?: string | null
}): Promise<{ refunded: boolean; newBalance: number }> {
  if (input.amount <= 0) return { refunded: false, newBalance: 0 }
  const result = await refundGenerationCredits(
    input.context.user.id,
    input.amount,
    input.refundKey,
    input.description,
    // The RPC's job id writes `credits_refunded` back onto a storyboard job
    // row. A quick generation has none, so it keeps its own tally below.
    null,
    input.context.supabase,
  )
  if (result.refunded && input.generationId) {
    await input.context.supabase
      .from(QUICK_GENERATIONS_TABLE)
      .update({ credits_refunded: input.amount })
      .eq("id", input.generationId)
      .eq("user_id", input.context.user.id)
  }
  return result
}

/**
 * A row the database refused.
 *
 * Standalone generation needs its own table, and until that migration is
 * applied the insert fails with "relation does not exist" — which tells the
 * user nothing they can act on and reads like the button is broken. Nothing has
 * been charged at this point, so the honest answer is that the feature is not
 * switched on yet.
 */
export function generationJobRejection(error: { message?: string; code?: string } | null): string | null {
  if (!error) return null
  const message = error.message || ""
  // 42P01 undefined_table, 42501 insufficient_privilege. Either means the
  // migration has not run: the table is absent, or present without its policy.
  const isSetupFailure = error.code === "42P01"
    || error.code === "42501"
    || /does not exist|row-level security|violates row-level|schema cache/i.test(message)
  if (!isSetupFailure) return null
  return "Quick Create is not finished setting up on this server: its database table is missing. Apply the pending migration (supabase db push) and try again. Nothing was charged."
}
