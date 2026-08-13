// Storyboard numbers as the user writes them. The fast path answers a direct
// "generate shot 2 video" without the agent loop, which it can only do if it
// reads the same number the user typed — proposing the first three shots
// instead was the one reason this path could not serve a named request.
//
// Numbers are 1-based, matching the storyboard and the number
// list_storyboard_shots reports. Resolution to shot ids is deliberately not
// done here: submit_generation resolves numbers against the episode, so a
// number that is wrong fails there with a message naming the episode's real
// shot count, rather than silently targeting the wrong shot.

const SHOT_RANGE = /\bshots?\s*(?:#\s*)?(\d{1,4})\s*(?:-|–|—|\bto\b|\bthrough\b)\s*(?:#\s*)?(\d{1,4})\b/g
const SHOT_LIST = /\bshots?\s*(?:#\s*)?(\d{1,4}(?:\s*(?:,|&|\band\b)\s*(?:#\s*)?\d{1,4})*)\b/g
const FIRST_SHOT = /\bfirst\s+(?:storyboard\s+)?shot\b/

// A range wider than this is a phrasing accident ("shots 2-900"), not a
// request; the agent handles those rather than the fast path proposing a
// hundred jobs the user never asked to pay for.
const MAX_RANGE_SPAN = 20

export function parseRequestedShotNumbers(message: string): number[] {
  const normalized = message.toLowerCase()
  const found: number[] = []

  for (const match of Array.from(normalized.matchAll(SHOT_RANGE))) {
    const start = Number(match[1])
    const end = Number(match[2])
    if (!start || !end || end < start || end - start >= MAX_RANGE_SPAN) continue
    for (let number = start; number <= end; number += 1) found.push(number)
  }

  // A range already consumed its own numbers; running the list pattern over the
  // whole message would read "shots 2-4" a second time as a bare "shot 2".
  const withoutRanges = normalized.replace(SHOT_RANGE, " ")
  for (const match of Array.from(withoutRanges.matchAll(SHOT_LIST))) {
    for (const part of match[1].split(/\s*(?:,|&|\band\b)\s*/)) {
      const number = Number(part.replace(/#/g, "").trim())
      if (Number.isInteger(number) && number > 0) found.push(number)
    }
  }

  if (!found.length && FIRST_SHOT.test(normalized)) found.push(1)

  return Array.from(new Set(found)).sort((a, b) => a - b)
}

export type VideoShotReferenceIntent = {
  targetShotNumbers: number[]
  referenceShotNumbers: number[]
}

// A continuation request contains two different kinds of shot number:
// "create shot 2" is the output, while "using shot 1 video as reference" is
// an input. Keeping those roles separate prevents one continuation request
// from becoming an accidental two-video batch.
const VIDEO_REFERENCE_SHOT = /\b(?:using|use|with|from)\s+(?:the\s+)?(?:(?:existing|completed|previous)\s+)?(?:video|clip)\s+(?:from|of)\s+(?:the\s+)?shots?\s*(?:#\s*)?(\d{1,4})\b|\b(?:using|use|with|from)\s+(?:the\s+)?(?:(?:existing|completed|previous)\s+)?shots?\s*(?:#\s*)?(\d{1,4})(?:'s)?(?:\s+(?:existing|completed|previous))?\s*(?:video|clip)?(?:\s+as\s+(?:a\s+)?ref(?:erence|rence))?/gi

export function parseVideoShotReferenceIntent(message: string): VideoShotReferenceIntent {
  const referenceShotNumbers: number[] = []
  const withoutReferences = message.replace(VIDEO_REFERENCE_SHOT, (match, videoFirst, shotFirst) => {
    const number = Number(videoFirst || shotFirst)
    if (Number.isInteger(number) && number > 0) referenceShotNumbers.push(number)
    return " ".repeat(match.length)
  })
  const allNumbers = parseRequestedShotNumbers(message)
  const references = Array.from(new Set(referenceShotNumbers)).sort((a, b) => a - b)
  const referenceSet = new Set(references)
  const explicitTargets = parseRequestedShotNumbers(withoutReferences).filter((number) => !referenceSet.has(number))
  const inferredNextTarget = !explicitTargets.length && references.length === 1 && /\bnext\s+(?:shot|scene|video)\b|\binto\s+the\s+next\s+scene\b/i.test(message)
    ? [references[0] + 1]
    : []

  return {
    // If no reference clause was recognized, retain the existing parser's
    // behavior. This keeps ordinary requests such as "generate shots 1, 2"
    // untouched.
    targetShotNumbers: references.length ? (explicitTargets.length ? explicitTargets : inferredNextTarget) : allNumbers,
    referenceShotNumbers: references,
  }
}

/**
 * Asking for the same thing again, in the ways people actually write it.
 *
 * "recreate the shot 6 video" matched nothing before: \bcreate\b does not fire
 * inside "recreate", so the request fell past both media paths to the agent,
 * which answered it with an inspection report on a different shot.
 */
const REDO_VERB = /\b(regenerate|re-generate|recreate|re-create|redo|re-do|remake|re-make|rerender|re-render|rerun|re-run|again)\b/i

export function wantsRedo(message: string) {
  return REDO_VERB.test(message)
}

export function parseTargetShotNumbers(message: string) {
  return parseVideoShotReferenceIntent(message).targetShotNumbers
}

export function buildVideoContinuationPrompt(input: {
  targetShotNumber: number
  referenceShotNumber?: number
  basePrompt: string
  style: string
}) {
  const style = input.style.trim()
  const realistic = /photo\s*-?real|realistic/i.test(style)
  const videoAlias = input.referenceShotNumber && input.referenceShotNumber !== input.targetShotNumber - 1
    ? `@storyboard shot ${input.referenceShotNumber} video`
    : "@previous shot video"
  return [
    `Extend from video ${videoAlias} into the next scene while following the composition and shot layout of @storyboard shot ${input.targetShotNumber} image.`,
    realistic ? "Photorealistic, hyper realistic." : `Maintain the project's ${style || "cinematic"} visual style.`,
    input.basePrompt.trim(),
  ].filter(Boolean).join("\n\n")
}

export function actionMatchesRequestedShots(intent: string, requestedShotNumbers: number[]) {
  if (!requestedShotNumbers.length) return true
  const actionShotNumbers = Array.from(intent.matchAll(/\bshots?\s+(?:#\s*)?(\d+)\b/gi)).map((match) => Number(match[1]))
  return !actionShotNumbers.length || actionShotNumbers.some((number) => requestedShotNumbers.includes(number))
}
