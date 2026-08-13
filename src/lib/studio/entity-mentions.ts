export type MentionableEntity = {
  id: string
  name: string
  type: "character" | "scene" | "prop"
  description?: string | null
  reference_images?: string[]
  primary_reference_image?: string | null
}

/**
 * The single image that stands for this entity during generation.
 *
 * Generation sends one reference per entity, so which one it is decides the
 * entity's visual identity in every shot. An explicit choice wins; otherwise
 * the first saved image does, which is what happened before the choice existed.
 */
export function entityPrimaryReference(entity: { reference_images?: string[] | null; primary_reference_image?: string | null }) {
  const images = (entity.reference_images || []).filter((path): path is string => typeof path === "string" && path.trim().length > 0)
  const chosen = typeof entity.primary_reference_image === "string" ? entity.primary_reference_image.trim() : ""
  if (chosen && images.includes(chosen)) return chosen
  return images[0]
}

/**
 * One image per entity: the chosen reference, in cast order, up to the budget.
 *
 * An entity's other images are not alternate views — they are the attempts the
 * user rejected, which is what the Choose button in Characters & Assets exists
 * to settle. The image models blend every reference into one output, so sending
 * the rejects alongside the keeper averages the face the user actually picked
 * with the ones they threw away.
 *
 * The budget is spent on subjects, never on second opinions about a subject.
 */
export function chosenReferences<T extends { reference_images?: string[] | null; primary_reference_image?: string | null }>(entities: T[], budget: number) {
  const chosen: string[] = []
  for (const entity of entities) {
    if (chosen.length >= budget) break
    const path = entityPrimaryReference(entity)
    if (path && !chosen.includes(path)) chosen.push(path)
  }
  return chosen
}

export type ActiveEntityMention = {
  start: number
  end: number
  query: string
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function findMentionedEntityIds(text: string, entities: MentionableEntity[]) {
  const matches: Array<{ id: string; index: number; length: number }> = []
  const sorted = [...entities].sort((a, b) => b.name.length - a.name.length)

  for (const entity of sorted) {
    const name = entity.name.trim()
    if (!name) continue
    const expression = new RegExp(`(^|[\\s([{,:;])@${escapeRegExp(name)}(?=$|[\\s)\\]},.!?:;])`, "i")
    const match = expression.exec(text)
    if (match) matches.push({ id: entity.id, index: match.index + match[1].length, length: name.length })
  }

  return matches
    .sort((a, b) => a.index - b.index || b.length - a.length)
    .map((match) => match.id)
    .filter((id, index, ids) => ids.indexOf(id) === index)
}

/**
 * The cast of a shot: entities its prompt actually refers to.
 *
 * An `@mention` is unambiguous and always counts. A prompt often also names its
 * location or props as plain prose ("the bedroom", "the suitcase"), which is
 * still a real reference — but matching bare names against the whole entity
 * library would drag in anything called "Note" or "Phone". So a bare name only
 * counts when the model also declared that entity for this shot: the declared
 * list bounds the candidates, and the prompt text confirms them.
 */
export function findShotCastEntityIds(text: string, entities: MentionableEntity[], declaredIds: string[] = []) {
  const mentioned = findMentionedEntityIds(text, entities)
  if (!declaredIds.length) return mentioned
  const declared = new Set(declaredIds)
  const confirmed = entities
    .filter((entity) => declared.has(entity.id) && !mentioned.includes(entity.id))
    .filter((entity) => {
      const name = entity.name.trim()
      if (name.length < 3) return false
      return new RegExp(`(^|[^\\w@])${escapeRegExp(name)}($|[^\\w])`, "i").test(text)
    })
    .map((entity) => entity.id)
  return [...mentioned, ...confirmed]
}

export function findActiveEntityMention(text: string, caret: number): ActiveEntityMention | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  const prefix = text.slice(0, safeCaret)
  const start = prefix.lastIndexOf("@")
  if (start < 0) return null

  const query = prefix.slice(start + 1)
  if (query.includes("\n") || query.includes("\r") || query.includes("@") || query.length > 100) return null
  const previous = start > 0 ? text[start - 1] : ""
  if (previous && !/[\s([{,:;]/.test(previous)) return null

  return { start, end: safeCaret, query }
}

export function insertEntityMention(text: string, entity: MentionableEntity, active: ActiveEntityMention) {
  const mention = `@${entity.name.trim()} `
  const value = `${text.slice(0, active.start)}${mention}${text.slice(active.end)}`
  return { value, caret: active.start + mention.length }
}

export function buildEntityMentionContext(entities: MentionableEntity[]) {
  if (!entities.length) return ""
  const withoutArt = entities.filter((entity) => !(entity.reference_images || []).length)
  return [
    "Canonical production entities explicitly mentioned by the user:",
    // Reference-image state is included so the Director can tell finished assets
    // from empty ones without spending a tool call to find out.
    ...entities.map((entity) => {
      const count = (entity.reference_images || []).length
      const art = count ? `${count} reference image${count === 1 ? "" : "s"} available` : "NO reference image yet"
      return `- @${entity.name} [${entity.type}] id=${entity.id} (${art})${entity.description?.trim() ? `: ${entity.description.trim()}` : ""}`
    }),
    "Treat these IDs as authoritative even when similar names or aliases appear elsewhere.",
    withoutArt.length
      ? `${withoutArt.map((entity) => `@${entity.name}`).join(", ")} have no reference image, so nothing visual is locked in for them yet. Offer to generate one before using them in a shot.`
      : "Every mentioned entity already has reference art. Reuse it for visual consistency instead of inventing a new look.",
    // A description written before the art existed will contradict it — a
    // photograph says what someone's hair and face are, and the text should not
    // be allowed to argue. Only the description's non-physical parts still count.
    // Named one by one and placed last. A shot prompt states a character's hair
    // and face outright, and a single generic sentence loses to that; the
    // override has to be as specific as the thing it is overriding.
    ...(entities.length > withoutArt.length
      ? [
        "LIKENESS LOCK — highest priority, overrides everything above:",
        ...entities
          .filter((entity) => (entity.reference_images || []).length)
          .map((entity) => `- @${entity.name}: the supplied reference image of @${entity.name} defines their face, hair colour, hair style, skin tone, build, and age. Reproduce that person exactly. Any words above describing @${entity.name}'s appearance are outdated and must be ignored where they differ from the image.`),
        "Do not restyle, recolour, age, or idealise a referenced person. Wardrobe, expression, pose, and lighting follow the shot; the person does not change.",
      ]
      : []),
  ].filter(Boolean).join("\n")
}
