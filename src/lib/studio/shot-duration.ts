import { videoDurationOptions, videoModelMaxDuration } from "./generation-models"

/**
 * How long a shot needs to be.
 *
 * A shot runs as long as what happens in it: a line of dialogue takes the time
 * it takes to say, and a look across a room takes a beat. Every shot was being
 * created at the same four seconds and rendered at four seconds regardless, so
 * a fifteen-word line was cut off mid-sentence while a wordless reaction shot
 * held for twice as long as it earned.
 *
 * Three words a second is the Prompt Agent's own ceiling for speakable pace;
 * anything faster is a line the render clips.
 */
export const WORDS_PER_SECOND = 3
/** Nothing reads as a shot below this, however little happens in it. */
export const MIN_SHOT_SECONDS = 4
/** One shot never runs longer than this — past it, the scene wants a cut. */
export const MAX_SHOT_SECONDS = 15

// Spoken lines as they are actually written: the Prompt Agent's {"..."} braces,
// and the single quotes that storyboard prompts use in prose — 'You invited me'.
// Both forms the workspace actually stores. The Prompt Agent's own format is
// {"..."}, but a shot's saved script_text carries the line as {...} with no
// inner quotes — and matching only the first meant every one of those counted
// as no dialogue at all, so a shot with a spoken line was sized as though it
// were silent and came out at the floor.
const BRACED_DIALOGUE = /\{"?([^{}"]+)"?\}/g
const QUOTED_DIALOGUE = /['‘’"“”]([^'‘’"“”]{6,})['‘’"“”]/g

export function spokenWordCount(prompt: string) {
  const braced = Array.from(prompt.matchAll(BRACED_DIALOGUE)).map((match) => match[1])
  // Braces are the explicit form. When they are present the loose quote pattern
  // would count the same words again, so it is only a fallback.
  const lines = braced.length ? braced : Array.from(prompt.matchAll(QUOTED_DIALOGUE)).map((match) => match[1])
  return lines.join(" ").trim().split(/\s+/).filter(Boolean).length
}

/**
 * A timed range the script already states, as `00:00-00:05` or `0:00 – 0:05`.
 *
 * A writer who has timed the scene has answered this question better than any
 * estimate can. The ad script this was written against opens
 * `### 00:00-00:05 - HOOK`, so shot one is five seconds because the script says
 * five seconds, not because of how many words are spoken in it.
 */
const SCRIPT_RANGE = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/

export function scriptRangeSeconds(scriptText: string): number | null {
  const match = SCRIPT_RANGE.exec(scriptText || "")
  if (!match) return null
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  const span = end - start
  return span > 0 ? span : null
}

/**
 * The runtime a shot's own content asks for, rounded to a length the model will
 * actually render and never longer than one shot should run.
 *
 * Spoken words are the strongest signal when there are any, because a line
 * clipped mid-sentence is the failure this exists to prevent. But they were the
 * *only* signal, so a shot with no dialogue — an aerial tracking move, a
 * reveal, a slam — fell to the four-second floor no matter how much happened in
 * it, and every wordless shot in a storyboard came out identical. A timed range
 * in the script text outranks both: it is the writer saying how long the beat
 * runs.
 */
export function estimateShotSeconds(prompt: string, model?: string) {
  const words = spokenWordCount(prompt)
  // A second of room either side of the line, so it does not start on the first
  // syllable and end on the last.
  const spoken = words ? Math.ceil(words / WORDS_PER_SECOND) + 1 : 0
  const scripted = scriptRangeSeconds(prompt) ?? 0
  // Whichever is longer: a timed range that cannot hold its own dialogue is
  // still a clipped line, and dialogue shorter than the scripted beat should
  // not shorten the beat.
  const needed = Math.max(spoken, scripted)
  const ceiling = Math.min(MAX_SHOT_SECONDS, model ? videoModelMaxDuration(model) : MAX_SHOT_SECONDS)
  const wanted = Math.min(Math.max(needed, MIN_SHOT_SECONDS), ceiling)
  const offered = (model ? videoDurationOptions(model) : [3, 4, 5, 6, 8, 10, 12, 15]).filter((seconds) => seconds <= ceiling)
  // Round up to an offered length: rounding down is what clips the last word.
  return offered.find((seconds) => seconds >= wanted) ?? offered.at(-1) ?? MIN_SHOT_SECONDS
}

/**
 * The runtime to render a stored shot at.
 *
 * A duration the user set by hand is the truth and is used as it stands, only
 * held to what the model can render. The default is not a decision anyone made,
 * so a shot still sitting on it is sized from its own content instead.
 */
export function resolveShotSeconds(shot: { duration_seconds?: number | null; prompt?: string | null; script_text?: string | null }, model?: string) {
  const stored = typeof shot.duration_seconds === "number" ? shot.duration_seconds : 0
  const ceiling = Math.min(MAX_SHOT_SECONDS, model ? videoModelMaxDuration(model) : MAX_SHOT_SECONDS)
  if (stored && stored !== MIN_SHOT_SECONDS) return Math.min(stored, ceiling)
  // The script text travels with the shot and carries the timed range the
  // writer gave it. Estimating from the prompt alone threw that away, so a
  // storyboard written before the range was read still renders at the floor.
  return estimateShotSeconds([shot.prompt || "", shot.script_text || ""].filter(Boolean).join("\n"), model)
}
