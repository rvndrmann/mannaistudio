import { z } from "zod"

export const continuityCategories = ["face", "age", "hair", "wardrobe", "accessories", "body_type", "voice", "location", "time_of_day", "weather", "prop", "product_design", "product_label", "camera_direction", "position", "physical_state", "story_state", "relationship", "previous_event"] as const

export const continuityFactSchema = z.object({
  entityId: z.string().uuid().nullable().default(null),
  scope: z.enum(["project", "series", "season", "episode", "scene", "shot"]).default("project"),
  scopeId: z.string().uuid().nullable().default(null),
  category: z.enum(continuityCategories),
  key: z.string().trim().min(1).max(200),
  value: z.unknown(),
  locked: z.boolean().default(false),
}).strict()

export type ContinuityFactInput = z.infer<typeof continuityFactSchema>

export function findContinuityConflicts(facts: ContinuityFactInput[]) {
  const approved = z.array(continuityFactSchema).parse(facts)
  const groups = new Map<string, ContinuityFactInput[]>()
  for (const fact of approved) {
    const key = `${fact.entityId ?? "project"}:${fact.category}:${fact.key}`
    groups.set(key, [...(groups.get(key) ?? []), fact])
  }
  return Array.from(groups.entries()).flatMap(([key, entries]) => {
    const values = new Set(entries.map((entry) => JSON.stringify(entry.value)))
    if (values.size < 2) return []
    return [{ key, severity: entries.some((entry) => entry.locked) ? "blocking" as const : "warning" as const, values: Array.from(values).map((value) => JSON.parse(value)) }]
  })
}
