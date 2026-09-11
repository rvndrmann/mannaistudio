import type { SupabaseClient } from "@supabase/supabase-js"

export class StudioRateLimitError extends Error {
  readonly status = 429
  constructor(message = "Too many requests. Please wait and try again.") { super(message); this.name = "StudioRateLimitError" }
}

/**
 * Counts one request against a user's bucket, refusing it past the limit.
 *
 * `userId` is for callers whose client cannot answer "who is this" on its own.
 * An external token resolves to the service client, which has no auth.uid(),
 * and the underlying function reads a missing identity as "refuse" — so every
 * director tool reached by a minted token was rejected on its first call until
 * the id was passed explicitly. Browser callers omit it and are keyed on their
 * session, which the function trusts ahead of anything passed in.
 */
export async function enforceStudioRateLimit(
  supabase: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
  userId?: string,
) {
  const { data, error } = await supabase.rpc("creator_consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    ...(userId ? { p_user_id: userId } : {}),
  })
  if (error) throw error
  if (!data) throw new StudioRateLimitError()
}
