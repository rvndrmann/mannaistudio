/**
 * A job's render settings, whichever route wrote them.
 *
 * Two routes create generation jobs and they named the same things
 * differently: the Director's path stores `durationSeconds` and `aspectRatio`,
 * the studio page's video route stores `duration` and `displayRatio`. Only the
 * first spelling was read back when a stalled job was recovered, so a clip the
 * user had asked to be ten seconds long was resubmitted with no length at all
 * and came back at the four second fallback — looking exactly as if the
 * provider had ignored the request.
 *
 * Read here once, in both spellings, so recovery renders what was asked for.
 */
export function jobRenderSettings(job: { settings?: unknown; provider_request?: unknown }): Record<string, unknown> {
  const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {})
  const seconds = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null)
  // "adaptive" is what a provider is told when it should follow a reference
  // clip. It is not a shape the studio can lay out, so it never stands in for one.
  const ratio = (value: unknown) => (typeof value === "string" && value.trim() && value !== "adaptive" ? value : null)
  const settings = record(job.settings)
  const request = record(job.provider_request)
  const durationSeconds = seconds(settings.durationSeconds) ?? seconds(settings.duration) ?? seconds(request.duration)
  const aspectRatio = ratio(settings.aspectRatio) ?? ratio(settings.displayRatio) ?? ratio(settings.ratio) ?? ratio(request.displayRatio)
  return {
    ...settings,
    ...(durationSeconds === null ? {} : { durationSeconds }),
    ...(aspectRatio === null ? {} : { aspectRatio }),
  }
}
