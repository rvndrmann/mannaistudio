import { describesReplacementState } from "./revision-phrasing"

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

/**
 * Catches a shot's image prompt when it is actually the whole scene.
 *
 * A shot's image prompt describes one frame — what the camera sees in a single
 * moment. The master prompt describes a whole scene across several seconds, in
 * named sections. Pasting the second into the first is a different mistake from
 * the identity block: it is not one paragraph with extra sentences, it is the
 * wrong document in the wrong field, and no amount of stripping fixes that —
 * it has to be rejected and rewritten as one frame.
 */
const SCENE_SECTION_HEADING = /(?:^|\n)\s*(?:[^\w\s]+\s*)*(?:image references|setting\s*(?:&|and)\s*atmosphere|scene prompt\s*[—–-]\s*timeline|consistency rules|negative rules|production notes)\b/i
const TIMED_BEAT = /(?:^|\n)\s*(?:[^\w\s]+\s*)*\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?\s*s\b/g

export function sceneNotFrameReason(prompt: string): string | null {
  if (SCENE_SECTION_HEADING.test(prompt)) return "This carries a whole scene's section headings (setting, consistency rules, production notes, and so on). A shot's image prompt describes one frame in a single paragraph — extract just this shot's moment, in your own words, and leave the rest of the master prompt where it is."
  const beats = prompt.match(TIMED_BEAT) || []
  if (beats.length > 1) return "This carries more than one timed beat, which is a scene's timeline rather than one shot's frame. An image prompt describes a single instant — pick the one moment this shot is, and write that."
  return null
}

/**
 * Sanitizes every prompt in a generation proposal before it is persisted and
 * shown for approval. Execution also sanitizes defensively, but doing it here
 * keeps the review card honest: the prompt the user sees is the prompt the
 * provider receives.
 */
export function stripIdentityDescriptionsFromPrompts(prompts: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(prompts).map(([key, prompt]) => [key, stripIdentityDescriptions(prompt)]),
  )
}

/**
 * "Fix the shot prompts and drop the character descriptions."
 *
 * The cleanup path rewrites every saved prompt through the identity stripper,
 * which is destructive and silent: the reply reports how many prompts it
 * cleaned, and nothing else in the workspace changes. So it must only claim a
 * message that is asking for exactly that.
 *
 * A message that names a new state — "rewrite the shot descriptions as a rainy
 * New York morning instead of neon night" — matches "rewrite", "shots" and
 * "descriptions", and used to be answered by stripping the identity text out of
 * prompts the user never mentioned while the look change went nowhere. When the
 * message names the identity text outright it is still cleanup, whatever else
 * it says.
 */
export function requestsPromptCleanup(message: string): boolean {
  const normalized = message.toLowerCase()
  if (!/\b(fix|clean|cleanup|strip|remove|delete|rewrite)\b/.test(normalized)) return false
  // Either the message names the identity text directly ("remove the character
  // lock"), or it names both a target and the descriptions ("fix the prompts,
  // drop the character descriptions"). Requiring all three at once meant the
  // ordinary way of asking sailed past this and reached the agent instead.
  // This path rewrites saved image prompts and nothing else, so a message about
  // the video prompts is not for it whatever else it says. "Rewrite the video
  // prompts for all 15 shots ... never describe their appearance. Do not change
  // any shot's image prompt" was answered by stripping the image prompts it
  // named as the one thing to leave alone, and the video prompts went unwritten.
  if (/\bvideo\s+prompts?\b/.test(normalized)) return false
  if (/\b(?:do not|don'?t|never)\s+(?:change|touch|edit|modify|alter|rewrite|overwrite)\b[^.]*\bimage\s+prompts?\b/.test(normalized)) return false
  const namesIdentityText = /\b(?:character|asset|cast)\s+(?:lock|descriptions?)\b|\bdescriptions?\s+of\s+(?:the\s+)?characters?\b|\bcharacter\s+description\s+remover\b/.test(normalized)
  if (namesIdentityText) return true
  if (describesReplacementState(normalized)) return false
  const namesTarget = /\b(prompts?|storyboard|shots?|scenes?)\b/.test(normalized)
  const namesDescriptions = /\b(descriptions?|identity|likeness|appearance)\b/.test(normalized)
  return namesTarget && namesDescriptions
}
