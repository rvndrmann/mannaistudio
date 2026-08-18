/**
 * The phrasing that marks a message as a change to something that already
 * exists, rather than a request to make something new.
 *
 * Every fast path in the Director chat answers before the agent runs, and each
 * one recognises its work by the nouns and verbs in the message. A revision
 * reuses both — "make every location a rainy New York morning instead of neon
 * night" says "make" and says "location" — so the path fires, reports on the
 * work that already exists, and the change never reaches the agent that would
 * have edited the saved input it comes from. The user is told their film is
 * finished; the thing they asked for never happened.
 *
 * The tell is contrast: a new state named against the old one. Someone asking
 * for work describes the subject; someone asking for a revision describes the
 * difference.
 */
const REPLACEMENT_STATE = [
  /\binstead of\b/,
  /\brather than\b/,
  /\bno longer\b/,
  /\bnot\s+(?:a|an|the)?\s*\w+\s*,?\s*but\b/,
  /\bchange\b[^.]*\bto\b/,
  /\bturn\b[^.]*\binto\b/,
  /\bswitch\b[^.]*\bto\b/,
  /\breplace\b[^.]*\bwith\b/,
  /\bupdate\b[^.]*\bto\b/,
  /\bmake (?:it|them|every|all|the)\b[^.]*\binstead\b/,
]

export function describesReplacementState(message: string): boolean {
  const normalized = message.toLowerCase()
  return REPLACEMENT_STATE.some((pattern) => pattern.test(normalized))
}

/**
 * Kept separate from the contrast patterns because "rewrite the prompts and
 * drop the character descriptions" is a revision of writing but an ordinary
 * request to the cleanup path, which is named after that very verb.
 */
export function describesLookChange(message: string): boolean {
  const normalized = message.toLowerCase()
  return describesReplacementState(normalized) || /\b(revise|rewrite|reword)\b/.test(normalized)
}
