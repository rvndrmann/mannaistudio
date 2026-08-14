import { MAX_SHOT_SECONDS, MIN_SHOT_SECONDS } from "./shot-duration"

/**
 * The video prompt a shot is filmed from.
 *
 * A shot's `prompt` is one paragraph written for the image model — it describes
 * a frame. Video wants the opposite: what happens across the runtime, second by
 * second. Reusing the image paragraph for both is why clips came back as a
 * still that drifts, and why nothing in the pipeline could carry timed beats
 * without ruining the keyframe that shares the field.
 *
 * So the video prompt lives beside the image one rather than replacing it, on
 * the shot's metadata, where the storyboard already keeps its per-shot extras.
 */

export type ShotWithVideoPrompt = { prompt?: string | null; title?: string | null; metadata?: unknown }

/**
 * A beat line, in the forms people actually write it:
 *
 *   0-4s: @Ethan turns from the mirror.
 *   ⏱️ 0–2s — URBAN SETUP
 *   4–5.5s — VILLAIN ATTACK
 *
 * The saved Seedance instruction uses the timestamped-title form with an em
 * dash and no colon, so a pattern that insisted on `0-4s:` rejected the format
 * this workspace's own Prompt Agent was written to produce.
 */
const BEAT = /(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*s\b/g

export function readShotVideoPrompt(shot: ShotWithVideoPrompt): string {
  const metadata = shot.metadata as { video_prompt?: unknown } | null | undefined
  const saved = typeof metadata?.video_prompt === "string" ? metadata.video_prompt.trim() : ""
  return saved
}

/** What the shot is filmed from: its video prompt, or the image paragraph until one is written. */
export function videoPromptFor(shot: ShotWithVideoPrompt): string {
  return readShotVideoPrompt(shot) || (shot.prompt || "").trim() || (shot.title || "").trim()
}

export function writeShotVideoPrompt(metadata: unknown, videoPrompt: string) {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  const trimmed = videoPrompt.trim()
  if (!trimmed) {
    const { video_prompt: _dropped, ...rest } = base
    return rest
  }
  return { ...base, video_prompt: trimmed }
}

export type ShotBeat = { start: number; end: number }

export function parseShotBeats(videoPrompt: string): ShotBeat[] {
  return Array.from(videoPrompt.matchAll(BEAT))
    .map((match) => ({ start: Number(match[1]), end: Number(match[2]) }))
    .filter((beat) => Number.isFinite(beat.start) && Number.isFinite(beat.end) && beat.end > beat.start)
}

/**
 * The runtime the beats themselves declare.
 *
 * A prompt that scripts up to eight seconds is asking for eight seconds;
 * rendering it at four cuts the last beat off entirely.
 */
export function beatRuntimeSeconds(videoPrompt: string): number | null {
  const beats = parseShotBeats(videoPrompt)
  if (!beats.length) return null
  const end = Math.max(...beats.map((beat) => beat.end))
  if (!end) return null
  return Math.min(Math.max(Math.ceil(end), MIN_SHOT_SECONDS), MAX_SHOT_SECONDS)
}

/**
 * What is wrong with a set of beats, in the words the writer needs to hear.
 *
 * A gap or an overlap is a prompt the model renders unpredictably — the seconds
 * either side of a hole are not the seconds the writer thought they were.
 */
export function describeBeatProblems(videoPrompt: string): string[] {
  const beats = parseShotBeats(videoPrompt)
  if (!beats.length) return ["No timed beats found. Write one block per beat, as `0-4s: …`."]
  const problems: string[] = []
  const ordered = [...beats].sort((a, b) => a.start - b.start)
  if (ordered[0].start !== 0) problems.push(`The first beat starts at ${ordered[0].start}s; beats must start at 0.`)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const beat = ordered[index]
    if (beat.start > previous.end) problems.push(`Nothing is scripted between ${previous.end}s and ${beat.start}s.`)
    if (beat.start < previous.end) problems.push(`Beats overlap between ${beat.start}s and ${previous.end}s.`)
  }
  const end = ordered.at(-1)!.end
  if (end > MAX_SHOT_SECONDS) problems.push(`The beats run to ${end}s; one shot renders at most ${MAX_SHOT_SECONDS}s, so this scene wants another cut.`)
  return problems
}
