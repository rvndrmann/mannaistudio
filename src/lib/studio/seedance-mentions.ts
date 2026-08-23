/**
 * Binds the Studio's @mentions to the reference images Seedance actually
 * receives.
 *
 * The workspace names characters and assets one way and the provider expects
 * another, and the two look close enough to have been mistaken for the same
 * thing. A prompt here says `@Sara`. Seedance's documented syntax is
 * `Sara@Image 1` — the subject first, then the asset it is bound to, carrying
 * the index of that image in the request. So `@Sara` arrived at the provider as
 * the literal characters "@Sara", which bind nothing: the reference image was
 * attached, and no part of the prompt pointed at it.
 *
 * That is the whole failure. The cast rides along as unlabelled pictures, the
 * model reads only the words, and a shot whose prompt says "a dark sleek modern
 * car" renders whatever car the words suggest rather than the one in the
 * reference — even though the right picture was sitting in the request.
 *
 * From the Seedance 2.0 prompt guide: "Each time a subject is involved, it must
 * be explicitly referred to to avoid omission… use <Subject_N>@<Image_N> to
 * emphasize the binding relationship between the subject and the asset."
 *
 * Translating here, at the provider boundary, rather than asking the Director to
 * write provider syntax: `@Sara` stays the one convention the storyboard, the
 * chat, the mention picker and the cast resolver all share, and the same prompt
 * still means something to Veo and fal, which have their own conventions or
 * none.
 */

/** An entity that has a reference image in this request, and where it sits. */
export type SeedanceSubject = {
  name: string
  /** 1-based position among the request's images, which is how Seedance counts. */
  imageIndex: number
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The same boundary rule the cast resolver matches mentions with, so a prompt
 * that resolved to a cast binds to exactly that cast. Anchored on the character
 * before the @ and the one after the name, so `@Sara` in `@Sarah` is not a hit
 * and an email address is not a mention.
 */
function mentionPattern(name: string) {
  return new RegExp(`(^|[\\s([{,:;])@${escapeRegExp(name)}(?=$|[\\s)\\]},.!?:;])`, "gi")
}

export type BoundPrompt = {
  prompt: string
  /** Names that were bound to an image, in the order they were bound. */
  bound: string[]
  /**
   * Names mentioned in the prompt that have no reference image in this request.
   * Left as written rather than rewritten: inventing an index would point the
   * model at another subject's picture, which is worse than not binding.
   */
  unbound: string[]
}

/**
 * Rewrites `@Name` as `Name@Image N` for every subject with a reference image.
 *
 * Longest name first. "Sara" and "Sara's Car" both start the same way, and
 * binding the short one first would leave `Sara@Image 1's Car` — a subject that
 * does not exist, pointing at the wrong picture.
 */
export function bindSeedanceMentions(prompt: string, subjects: SeedanceSubject[], mentionedNames: string[] = []): BoundPrompt {
  const usable = subjects
    .filter((subject) => subject.name.trim() && Number.isInteger(subject.imageIndex) && subject.imageIndex > 0)
    .sort((a, b) => b.name.trim().length - a.name.trim().length)

  let bound: string[] = []
  let formatted = prompt
  for (const subject of usable) {
    const name = subject.name.trim()
    const pattern = mentionPattern(name)
    let hit = false
    formatted = formatted.replace(pattern, (_match, lead: string) => {
      hit = true
      return `${lead}${name}@Image ${subject.imageIndex}`
    })
    if (hit) bound.push(name)
  }

  // A name the prompt mentions that this request carries no picture for. Worth
  // reporting: it is usually an asset nobody generated reference art for, and
  // the clip will invent one.
  const boundLower = new Set(bound.map((name) => name.toLowerCase()))
  const unbound = mentionedNames
    .map((name) => name.trim())
    .filter((name) => name && !boundLower.has(name.toLowerCase()))
    .filter((name) => mentionPattern(name).test(prompt))
    .filter((name, index, names) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)

  return { prompt: formatted, bound, unbound }
}

/**
 * Whether a prompt still carries a bare @mention after binding.
 *
 * Seedance reads a leftover "@Sara" as literal text, so this is the check that
 * says a cast member is travelling as a picture nobody pointed at.
 */
export function unboundMentions(prompt: string): string[] {
  return Array.from(prompt.matchAll(/(?:^|[\s([{,:;])@([\w][\w' -]*?)(?=$|[\s)\]},.!?:;])/g))
    .map((match) => match[1].trim())
    // "Sara@Image 1" is bound; the @ there is part of the binding, not a mention.
    .filter((name) => !/^Image\s+\d+$/i.test(name))
    .filter((name, index, names) => names.indexOf(name) === index)
}
