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
const BRACED_DIALOGUE = /\{"([^"]*)"\}/g
const QUOTED_DIALOGUE = /['‘’"“”]([^'‘’"“”]{6,})['‘’"“”]/g

export function spokenWordCount(prompt: string) {
  const braced = Array.from(prompt.matchAll(BRACED_DIALOGUE)).map((match) => match[1])
  // Braces are the explicit form. When they are present the loose quote pattern
  // would count the same words again, so it is only a fallback.
  const lines = braced.length ? braced : Array.from(prompt.matchAll(QUOTED_DIALOGUE)).map((match) => match[1])
  return lines.join(" ").trim().split(/\s+/).filter(Boolean).length
}

/**
 * The runtime a shot's own content asks for, rounded to a length the model will
 * actually render and never longer than one shot should run.
 */
export function estimateShotSeconds(prompt: string, model?: string) {
  const words = spokenWordCount(prompt)
  // A second of room either side of the line, so it does not start on the first
  // syllable and end on the last.
  const needed = words ? Math.ceil(words / WORDS_PER_SECOND) + 1 : 0
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
export function resolveShotSeconds(shot: { duration_seconds?: number | null; prompt?: string | null }, model?: string) {
  const stored = typeof shot.duration_seconds === "number" ? shot.duration_seconds : 0
  const ceiling = Math.min(MAX_SHOT_SECONDS, model ? videoModelMaxDuration(model) : MAX_SHOT_SECONDS)
  if (stored && stored !== MIN_SHOT_SECONDS) return Math.min(stored, ceiling)
  return estimateShotSeconds(shot.prompt || "", model)
}
