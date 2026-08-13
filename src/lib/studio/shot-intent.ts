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

export function actionMatchesRequestedShots(intent: string, requestedShotNumbers: number[]) {
  if (!requestedShotNumbers.length) return true
  const actionShotNumbers = Array.from(intent.matchAll(/\bshots?\s+(?:#\s*)?(\d+)\b/gi)).map((match) => Number(match[1]))
  return !actionShotNumbers.length || actionShotNumbers.some((number) => requestedShotNumbers.includes(number))
}
