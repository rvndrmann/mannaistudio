import { beatRuntimeSeconds, describeBeatProblems, writeShotVideoPrompt } from "./shot-video-prompt"
import { sceneNotFrameReason, stripIdentityDescriptions } from "./prompt-sanitizer"

/**
 * The one place a shot's writing is prepared for the database.
 *
 * A shot could be written from two directions — the Director's `update_shot`
 * tool and the storyboard editor's `saveShot` action — and only the tool
 * enforced the two rules that matter. The editor wrote whatever it was given,
 * so a prompt typed by hand kept its identity block and outranked the
 * character's reference art, which is the exact failure the sanitizer exists
 * to prevent. A rule enforced on one of two doors is not a rule.
 *
 * So both doors call this. Adding a third means calling it too, rather than
 * remembering which guards to copy.
 */

export type ShotPromptPatch = {
  prompt?: string | null
  video_prompt?: string | null
  duration_seconds?: number
  [key: string]: unknown
}

/**
 * Rejects an image prompt that describes a whole scene instead of one frame.
 *
 * Throws rather than returning, because a scene written into a frame is not a
 * degraded result — it is the wrong kind of writing, and saving it silently
 * produces a keyframe nobody asked for.
 */
export function assertShotPromptShape(patch: ShotPromptPatch): void {
  if (typeof patch.prompt === "string") {
    const reason = sceneNotFrameReason(patch.prompt)
    if (reason) throw new Error(reason)
  }

  // The video prompt gets the same guard, on the same door.
  //
  // create_storyboard_batch and write_shot_video_prompts both refuse beats
  // that do not add up; update_shot and the storyboard editor did not, so the
  // one path a revision actually takes — "change this prompt" — was the one
  // path that could quietly replace timed beats with a paragraph. A rewritten
  // shot then filmed as a drifting still again, which is the failure the beats
  // exist to prevent.
  //
  // Clearing the field is not writing a bad prompt: an empty string removes it
  // and falls back to the image prompt, which is a decision the caller is
  // allowed to make.
  if (typeof patch.video_prompt === "string" && patch.video_prompt.trim()) {
    const problems = describeBeatProblems(patch.video_prompt)
    if (problems.length) throw new Error(problems.slice(0, 4).join(" "))
  }
}

/**
 * Turns a patch into the columns to write.
 *
 * - The image prompt is stored without its written identity block, so the
 *   reference art stays the authority on what a character looks like.
 * - The video prompt is folded into metadata against the row as it stands.
 *   Patching metadata wholesale would drop `cast_curated` and everything else
 *   the storyboard keeps there.
 * - Timed beats are the runtime, unless the same patch sets one outright.
 *
 * `currentMetadata` is the row's existing metadata, or the metadata the caller
 * is writing in this same operation — the editor sends its own, the tool reads
 * the row's first.
 */
export function normalizeShotColumns(patch: ShotPromptPatch, currentMetadata: unknown): Record<string, unknown> {
  const columns: Record<string, unknown> = typeof patch.prompt === "string"
    ? { ...patch, prompt: stripIdentityDescriptions(patch.prompt) }
    : { ...patch }

  if (!("video_prompt" in columns)) return columns

  const { video_prompt: videoPrompt, ...rest } = columns
  const written = typeof videoPrompt === "string" ? stripIdentityDescriptions(videoPrompt) : ""
  const runtime = written ? beatRuntimeSeconds(written) : null
  return {
    ...rest,
    metadata: writeShotVideoPrompt(currentMetadata, written),
    ...(runtime && rest.duration_seconds === undefined ? { duration_seconds: runtime } : {}),
  }
}
