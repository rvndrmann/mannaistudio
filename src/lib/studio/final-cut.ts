/**
 * The episode's edited cut: the video exported from the Timeline editor.
 *
 * The browser uploads the file straight to storage under the caller's own
 * prefix (the bucket's policy only lets a user write there), then asks the
 * workspace route to record it on the episode. The route trusts nothing about
 * the path but its shape, which is checked here.
 */

export type FinalCut = {
  path: string
  filename: string
  duration_seconds: number | null
  size_bytes: number | null
  saved_at: string
  saved_by: string
}

const VIDEO_EXTENSION = /\.(mp4|webm|mov)$/i

function folder(userId: string, projectId: string, episodeId: string) {
  return `${userId}/${projectId}/final-cuts/${episodeId}/`
}

export function finalCutStoragePath(input: { userId: string; projectId: string; episodeId: string; filename: string; now?: number }) {
  const extension = input.filename.match(VIDEO_EXTENSION)?.[1]?.toLowerCase() || "mp4"
  const base = input.filename.replace(VIDEO_EXTENSION, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "cut"
  return `${folder(input.userId, input.projectId, input.episodeId)}${input.now ?? Date.now()}-${base}.${extension}`
}

function finiteOrNull(value: unknown, digits: number) {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  const scale = 10 ** digits
  return Math.round(number * scale) / scale
}

/** Validates a saveFinalCut request; throws with a user-readable message. */
export function parseFinalCutSave(
  body: { path?: unknown; filename?: unknown; durationSeconds?: unknown; sizeBytes?: unknown },
  context: { userId: string; projectId: string; episodeId: string; now?: Date },
): FinalCut {
  const path = typeof body.path === "string" ? body.path : ""
  const expectedFolder = folder(context.userId, context.projectId, context.episodeId)
  const name = path.slice(expectedFolder.length)
  if (!path.startsWith(expectedFolder) || !name || name.includes("/") || name.includes("..") || !VIDEO_EXTENSION.test(name)) {
    throw new Error("The cut was not uploaded to this episode's folder.")
  }
  const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 200) : name
  return {
    path,
    filename,
    duration_seconds: finiteOrNull(body.durationSeconds, 2),
    size_bytes: finiteOrNull(body.sizeBytes, 0),
    saved_at: (context.now ?? new Date()).toISOString(),
    saved_by: context.userId,
  }
}

export function readFinalCut(value: unknown): FinalCut | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.path !== "string" || !record.path) return null
  return {
    path: record.path,
    filename: typeof record.filename === "string" ? record.filename : record.path.split("/").pop() || "cut.mp4",
    duration_seconds: typeof record.duration_seconds === "number" ? record.duration_seconds : null,
    size_bytes: typeof record.size_bytes === "number" ? record.size_bytes : null,
    saved_at: typeof record.saved_at === "string" ? record.saved_at : "",
    saved_by: typeof record.saved_by === "string" ? record.saved_by : "",
  }
}
