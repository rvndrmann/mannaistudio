/**
 * A shot's trim: the part of its generated video the edit uses, in seconds.
 * Stored on the shot as metadata.trim = { start, end }.
 */
type TrimmableShot = { duration_seconds?: number | null; metadata?: Record<string, unknown> | null }

function storedTrim(shot: TrimmableShot) {
  return shot.metadata?.trim as { start?: number; end?: number } | undefined
}

export function getShotTrimStart(shot: TrimmableShot): number {
  const trim = storedTrim(shot)
  return typeof trim?.start === "number" && Number.isFinite(trim.start) && trim.start >= 0 ? trim.start : 0
}

export function getShotTrimEnd(shot: TrimmableShot): number {
  const trim = storedTrim(shot)
  const duration = Number(shot.duration_seconds || 5)
  if (typeof trim?.end === "number" && Number.isFinite(trim.end) && trim.end > 0) {
    return Math.min(trim.end, duration > 0 ? duration : trim.end)
  }
  return duration > 0 ? duration : 5
}
