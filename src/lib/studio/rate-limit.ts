import type { SupabaseClient } from "@supabase/supabase-js"

export class StudioRateLimitError extends Error {
  readonly status = 429
  constructor(message = "Too many requests. Please wait and try again.") { super(message); this.name = "StudioRateLimitError" }
}

export async function enforceStudioRateLimit(supabase: SupabaseClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await supabase.rpc("creator_consume_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) throw error
  if (!data) throw new StudioRateLimitError()
}
