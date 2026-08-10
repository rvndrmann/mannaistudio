export type MentionableEntity = {
  id: string
  name: string
  type: "character" | "scene" | "prop"
  description?: string | null
  reference_images?: string[]
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
  return [
    "Canonical production entities explicitly mentioned by the user:",
    ...entities.map((entity) => `- @${entity.name} [${entity.type}] id=${entity.id}${entity.description?.trim() ? `: ${entity.description.trim()}` : ""}`),
    "Treat these IDs as authoritative even when similar names or aliases appear elsewhere.",
  ].join("\n")
}
