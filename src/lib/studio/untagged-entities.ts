import { findMentionedEntityIds, type MentionableEntity } from "./entity-mentions"

/**
 * Catches an entity the prompt describes in words instead of naming with @.
 *
 * The @tag is not decoration. Reference images are attached to a generation
 * positionally, and the tag is what binds a subject in the prompt to the
 * picture of it in the request — Seedance's own syntax is `Sara@Image 1`, which
 * the workspace writes from the tag. A subject written as prose therefore ships
 * with its reference image attached and nothing pointing at it, and the model
 * renders it from the words instead. That is exactly how "a dark sleek modern
 * car" produced a car that was not the project's car, in a request that was
 * carrying a photograph of the right one.
 *
 * Instruction did not fix this. The tool descriptions, the Storyboard Agent's
 * brief and the Video Prompt Agent's brief all now say to tag every subject on
 * every mention, and prompts still came back with the character tagged and the
 * vehicle and the location described. So it is checked rather than asked for.
 *
 * The check is deliberately narrow. It only looks for the entity's own saved
 * name appearing as words, and only for entities that have reference art to
 * bind to — a name nobody has drawn yet has no picture to point at, so writing
 * it in prose costs nothing.
 */

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The entity's name appearing as ordinary words rather than as a tag.
 *
 * The negative lookbehind on @ is what separates the two: `@Sara` is a tag and
 * `Sara` is prose, and only the second is a finding.
 */
function proseMention(name: string) {
  return new RegExp(`(^|[^\\w@])${escapeRegExp(name)}($|[^\\w])`, "i")
}

export type UntaggedEntity = {
  id: string
  name: string
  type: string
}

/**
 * Entities this prompt refers to by name without tagging them.
 *
 * Only entities that carry reference art are reported: those are the ones with
 * a picture in the request that the prose is failing to bind to.
 */
export function findUntaggedEntities(prompt: string, entities: MentionableEntity[]): UntaggedEntity[] {
  const text = (prompt || "").trim()
  if (!text) return []
  const tagged = new Set(findMentionedEntityIds(text, entities))

  return entities
    .filter((entity) => !tagged.has(entity.id))
    .filter((entity) => (entity.reference_images || []).length > 0)
    .filter((entity) => {
      const name = (entity.name || "").trim()
      // Two characters is not a name worth matching — "Al" would fire on
      // "always", and the false positive blocks work that is perfectly correct.
      if (name.length < 3) return false
      return proseMention(name).test(text)
    })
    .map((entity) => ({ id: entity.id, name: entity.name, type: entity.type }))
}

/**
 * The refusal, written so the writer can act on it without guessing.
 *
 * Names the entity, says what to write instead, and says why — a rejection that
 * only states a rule gets worked around rather than fixed.
 */
export function describeUntaggedEntities(untagged: UntaggedEntity[], where: string): string {
  if (!untagged.length) return ""
  const named = untagged.map((entity) => `"${entity.name}" (write @${entity.name})`).join(", ")
  return `${where} names ${untagged.length === 1 ? "an asset" : "assets"} in words that the project already has reference art for: ${named}. The @tag is what binds a subject to its reference image when the prompt reaches the provider, so an asset described in words is rendered from the words and comes back looking like a different one. Use the @tag on every mention.`
}
