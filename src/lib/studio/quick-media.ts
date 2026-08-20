/**
 * The parts of standalone generation both sides of the wire need.
 *
 * `quick-generation.ts` is server-only — it reaches the vault and the storage
 * admin API — so the browser cannot import it even for a constant. These few
 * shared facts live here instead of being retyped in the client, where a
 * mismatched folder name would silently upload references somewhere the server
 * refuses to read.
 */

export const MEDIA_BUCKET = "creator-studio-media"

/** Second path segment for standalone media, where a project id would sit. */
export const QUICK_MEDIA_FOLDER = "quick"

export type QuickHistoryItem = {
  id: string
  type: "image" | "video"
  status: string
  prompt: string
  model: string
  provider: string
  resultPath: string | null
  error: string | null
  creditsCharged: number
  billingMode: string
  settings: Record<string, unknown>
  createdAt: string
  completedAt: string | null
}
