// Storyboard numbers as the user writes them.
//
// This file used to be the Director's router: a dozen readers that decided,
// from the words in a message, whether the user wanted a keyframe or a clip, a
// redo or a skip, one shot or the whole storyboard — and then acted on the
// answer before the model was ever called. Each reader was added to fix one
// wrong reply, each of them guessed, and a guess that spent credits was a
// guess the user paid for. The model reads its own requests now.
//
// What is left never decides anything. It reads shot numbers so a finished turn
// can offer the buttons that belong to the shots it was about, and it writes the
// half-finished sentence the storyboard's insert button puts in the composer.
//
// Numbers are 1-based, matching the storyboard and the number
// list_storyboard_shots reports. Resolution to shot ids is deliberately not
// done here: submit_generation resolves numbers against the episode, so a
// number that is wrong fails there with a message naming the episode's real
// shot count, rather than silently targeting the wrong shot.

const SHOT_RANGE = /\bshots?\s*(?:#\s*)?(\d{1,4})\s*(?:-|–|—|\bto\b|\bthrough\b)\s*(?:#\s*)?(\d{1,4})\b/g
const SHOT_LIST = /\bshots?\s*(?:#\s*)?(\d{1,4}(?:\s*(?:,|&|\band\b)\s*(?:#\s*)?\d{1,4})*)\b/g
const FIRST_SHOT = /\bfirst\s+(?:storyboard\s+)?shot\b/

// A range wider than this is a phrasing accident ("shots 2-900") rather than a
// request, and reading it as one would scope a reply to a hundred shots.
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

// A continuation request contains two different kinds of shot number:
// "create shot 2" is the output, while "using shot 1 video as reference" is
// an input. Keeping the roles apart is what stops a reply about shot 2 from
// also offering the buttons that belong to shot 1.
const VIDEO_REFERENCE_SHOT = /\b(?:using|use|with|from)\s+(?:the\s+)?(?:(?:existing|completed|previous)\s+)?(?:video|clip)\s+(?:from|of)\s+(?:the\s+)?shots?\s*(?:#\s*)?(\d{1,4})\b|\b(?:using|use|with|from)\s+(?:the\s+)?(?:(?:existing|completed|previous)\s+)?shots?\s*(?:#\s*)?(\d{1,4})(?:'s)?(?:\s+(?:existing|completed|previous))?\s*(?:video|clip)?(?:\s+as\s+(?:a\s+)?ref(?:erence|rence))?/gi

/**
 * The shots a message is *about*, ignoring the ones it only cites as
 * references. Used to scope the next-step buttons a finished turn offers —
 * never to decide what the turn does.
 */
export function parseTargetShotNumbers(message: string): number[] {
  const referenceShotNumbers: number[] = []
  const withoutReferences = message.replace(VIDEO_REFERENCE_SHOT, (match, videoFirst, shotFirst) => {
    const number = Number(videoFirst || shotFirst)
    if (Number.isInteger(number) && number > 0) referenceShotNumbers.push(number)
    return " ".repeat(match.length)
  })
  const references = new Set(referenceShotNumbers)
  if (!references.size) return parseRequestedShotNumbers(message)
  return parseRequestedShotNumbers(withoutReferences).filter((number) => !references.has(number))
}

/**
 * The half-written instruction the storyboard's insert button puts in the
 * composer, for the gap after `afterNumber` of `total` shots.
 *
 * Nothing reads this back with a regex any more — the agent reads the sentence
 * the same way it reads anything else the user types. It stays a fixed phrasing
 * so the composer is predictable, not so a parser can match it.
 */
export function buildInsertShotDraft(afterNumber: number, total: number) {
  if (afterNumber <= 0) return "I want to add a new shot before shot 1: "
  if (afterNumber >= total) return `I want to add a new shot after shot ${afterNumber}: `
  return `I want to add a new shot between shot ${afterNumber} and shot ${afterNumber + 1}: `
}

export function actionMatchesRequestedShots(intent: string, requestedShotNumbers: number[]) {
  if (!requestedShotNumbers.length) return true
  const actionShotNumbers = Array.from(intent.matchAll(/\bshots?\s+(?:#\s*)?(\d+)\b/gi)).map((match) => Number(match[1]))
  if (!actionShotNumbers.length) return true
  if (actionShotNumbers.some((number) => requestedShotNumbers.includes(number))) return true
  // Finishing one shot is the moment the step after it is most worth offering,
  // so the shot immediately following the request is kept — holding it back is
  // why a turn that put a keyframe on shot 1 ended with no button at all.
  //
  // Only the next one. Any later shot was read as "the production moving
  // forward", but the pipeline reports the first shot that still needs work
  // anywhere in the episode, which is not necessarily related to this turn at
  // all. Asking to redo shot 7 offered "generate the keyframe for shot 11" —
  // an unfinished job from earlier in the session that the request had nothing
  // to do with — and taking that offer spent credits on the wrong shot. A jump
  // forward is as much a jump as a jump back; only the step the finished shot
  // actually leads to survives.
  const furthestRequested = Math.max(...requestedShotNumbers)
  return actionShotNumbers.every((number) => number === furthestRequested + 1)
}
