/**
 * Turns anything thrown into a message worth showing.
 *
 * Supabase rejects with a `PostgrestError` — a plain object carrying `message`,
 * `details`, `hint`, and `code`, and *not* an instance of `Error`. Routes that
 * tested `error instanceof Error` therefore replaced every database failure
 * with a generic fallback, leaving no way to tell an RLS denial from a missing
 * column.
 */
export function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const message = typeof candidate.message === "string" ? candidate.message.trim() : ""
    const details = typeof candidate.details === "string" ? candidate.details.trim() : ""
    const hint = typeof candidate.hint === "string" ? candidate.hint.trim() : ""
    const code = typeof candidate.code === "string" ? candidate.code.trim() : ""
    const parts = [message || details, hint].filter(Boolean)
    if (parts.length) return code ? `${parts.join(" — ")} (${code})` : parts.join(" — ")
  }
  return fallback
}
