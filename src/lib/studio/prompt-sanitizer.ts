/**
 * Strips written identity from a shot prompt before it reaches an image or video
 * model.
 *
 * A referenced character's look is defined by their reference art. When the
 * prompt also spells out hair, eyes, build, and wardrobe — the "CHARACTER /
 * ASSET LOCK" block prompt writers like to open with — the model has two
 * descriptions of the same person and follows the words, because words are what
 * it reads first. That is what makes a face drift from shot to shot despite a
 * locked reference.
 *
 * The mentions themselves are kept: they are how the cast is resolved and how
 * the model knows who is in frame. Only the description of them goes.
 */

// "🎭 CHARACTER / ASSET LOCK", "CHARACTER LOCK:", "ASSET LOCK —", and friends.
const LOCK_HEADING = /^\s*(?:[^\w\s]+\s*)*(?:character|asset|cast)\s*(?:\/|,|&|and)?\s*(?:character|asset|cast)?\s*lock\b\s*[:—–-]?\s*$/i

// A heading opens a new section and therefore ends the one being dropped. Either
// a leading symbol run ("🌍 SETTING"), or a short all-caps line.
const SECTION_HEADING = /^\s*(?:[^\w\s]+\s*)+[A-Z][^\n]*$|^\s*[A-Z0-9\s/&'’.,—–-]{3,60}$/

// "@Lena — Young woman mid-20s, fair freckled skin, ..." — a mention, a dash,
// and a description. Action lines name a character mid-sentence instead, so they
// do not match.
const IDENTITY_LINE = /^\s*@[\w-]+(?:\s+[\w-]+)?\s*[—–:-]\s*\S.{24,}$/

const MENTION = /@[\w-]+/g

// An emoji or symbol run, which is how these prompts mark a new section.
const SECTION_MARKER = "(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF])[\\uFE0F\\u20E3]*"
const INLINE_SECTION = new RegExp(`[ \\t]*(${SECTION_MARKER})`, "g")
// "@Ethan — Young adult man, ..." starting an entry rather than a sentence.
const INLINE_IDENTITY = /[ \t]*(@[\w-]+\s*[—–]\s)/g

/**
 * Puts each section and each cast entry on its own line.
 *
 * A prompt saved as one long paragraph carries exactly the same lock block as
 * one saved with line breaks, and the reader cannot tell them apart — but a
 * line-based filter can only see the second. Normalising first is what makes
 * the strip work on prompts the model wrote as a single run of text.
 */
function normalize(prompt: string) {
  return prompt.replace(INLINE_SECTION, "\n$1").replace(INLINE_IDENTITY, "\n$1")
}

/**
 * Returns the prompt with identity descriptions removed. When a dropped block
 * named characters, one line naming them replaces it, so the model still knows
 * the cast without being told what they look like.
 */
export function stripIdentityDescriptions(prompt: string): string {
  const lines = normalize(prompt).split("\n")
  const kept: string[] = []
  const dropped: string[] = []
  let inLockSection = false

  for (const line of lines) {
    if (LOCK_HEADING.test(line)) {
      inLockSection = true
      dropped.push(line)
      continue
    }
    if (inLockSection) {
      // The section ends at the next heading, not at the first blank line: these
      // blocks are routinely written with blank lines between cast members.
      if (line.trim() && !IDENTITY_LINE.test(line) && SECTION_HEADING.test(line)) {
        inLockSection = false
      } else {
        dropped.push(line)
        continue
      }
    }
    if (IDENTITY_LINE.test(line)) {
      dropped.push(line)
      continue
    }
    kept.push(line)
  }

  if (!dropped.length) return prompt

  const cast = Array.from(new Set(dropped.join("\n").match(MENTION) || []))
  const body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return cast.length ? `${body ? `${body}\n\n` : ""}Cast in frame: ${cast.join(", ")}.` : body
}

/** True when the prompt still carries a written identity block. */
export function hasIdentityDescriptions(prompt: string): boolean {
  return stripIdentityDescriptions(prompt) !== prompt
}
