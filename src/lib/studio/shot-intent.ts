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

/**
 * "Generate all the shot images."
 *
 * One shot at a time is the only thing the image path could answer, so a
 * request covering the whole storyboard fell through to the agent, which
 * proposed them one by one with no total in front of the user. A batch is a
 * single decision — how many frames, at what total cost — and it is worth
 * answering as one.
 */
export type ShotBatchIntent = {
  /** Every shot that still needs a frame. */
  all: boolean
  /** "the next 3", "3 more", "first 3" — take this many from the front. */
  chunk: number | null
  /** Shots named outright, when the user listed them. */
  numbers: number[]
}

const BATCH_ALL = /\b(?:all|every|each)\b(?:\s+(?:the|of\s+the|remaining|rest\s+of\s+the))?\s*(?:storyboard\s+)?shots?\b|\ball\s+(?:the\s+)?(?:storyboard\s+)?shot\s+(?:image|keyframe)s?\b|\b(?:remaining|rest\s+of\s+the)\s+(?:storyboard\s+)?shots?\b|\bfor\s+all\s+shots?\b/i
// "the next 3", "3 more", "another 3", "first 3" — the size of one helping.
const BATCH_CHUNK = /\b(?:next|another|first)\s+(\d{1,2})\b|\b(\d{1,2})\s+more\b/i
// A chunk this large is the whole batch by another name, and a number this
// small is almost always a shot number rather than a helping size.
const MAX_CHUNK = 25

export function parseShotImageBatchIntent(message: string): ShotBatchIntent | null {
  const all = BATCH_ALL.test(message)
  const chunkMatch = message.match(BATCH_CHUNK)
  const chunkSize = chunkMatch ? Number(chunkMatch[1] || chunkMatch[2]) : 0
  const chunk = chunkSize > 0 && chunkSize <= MAX_CHUNK ? chunkSize : null
  // A helping is counted in shots, not named by shot number, so the digits it
  // consumed must not be read a second time as a list of targets.
  const numbers = chunk ? [] : parseRequestedShotNumbers(message)
  if (!all && !chunk && numbers.length < 2) return null
  return { all, chunk, numbers }
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

// Which medium a request names, if it names one at all.
const NAMES_IMAGE = /\b(image|images|keyframe|keyframes|frame|poster|visual|visuals|still|photo|picture)\b/i
const NAMES_VIDEO = /\b(video|videos|clip|clips|animate|animation|motion|render|footage|shot\s+film)\b/i

export function namesImageMedium(message: string) {
  return NAMES_IMAGE.test(message)
}

export function namesVideoMedium(message: string) {
  return NAMES_VIDEO.test(message)
}

/**
 * "Regenerate shot 15" — a shot the user wants redone, without saying which of
 * its two halves.
 *
 * A shot is a keyframe and a clip, and they cost very differently: a Seedance
 * 2.5 render is fifty credits a second where the keyframe is eight. This used
 * to resolve silently to the image, which is the cheaper guess but still a
 * guess, and a user who meant the clip paid for a frame they did not ask for
 * and had to ask again. Nothing in the sentence says which, so nothing should
 * be assumed — the reply asks.
 */
export function isAmbiguousShotRedo(message: string) {
  if (!wantsRedo(message)) return false
  if (namesImageMedium(message) || namesVideoMedium(message)) return false
  return parseTargetShotNumbers(message).length > 0
}

export function parseTargetShotNumbers(message: string) {
  return parseVideoShotReferenceIntent(message).targetShotNumbers
}

export function buildVideoContinuationPrompt(input: {
  targetShotNumber: number
  referenceShotNumber?: number
  /**
   * Names a clip that shot numbers cannot reach — the previous episode's
   * ending. "@previous shot video" would point at this episode's storyboard,
   * where the shot being continued from does not exist.
   */
  referenceAlias?: string
  basePrompt: string
  style: string
}) {
  const style = input.style.trim()
  const realistic = /photo\s*-?real|realistic/i.test(style)
  const videoAlias = input.referenceAlias
    ? input.referenceAlias
    : input.referenceShotNumber && input.referenceShotNumber !== input.targetShotNumber - 1
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
  if (!actionShotNumbers.length) return true
  if (actionShotNumbers.some((number) => requestedShotNumbers.includes(number))) return true
  // Finishing one shot is the moment the step after it is most worth offering.
  // The pipeline is read after this turn's work has landed, so a later shot is
  // the production moving forward — holding it back is why a turn that put a
  // keyframe on shot 1 ended with no button at all. A step pointing back at an
  // earlier shot is a different matter: that reads as a jump, and still waits.
  const furthestRequested = Math.max(...requestedShotNumbers)
  return actionShotNumbers.every((number) => number > furthestRequested)
}
