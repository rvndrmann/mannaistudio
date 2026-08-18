import { z } from "zod"
import { brandAssetKinds, brandKnowledgeKinds, type BrandRecord } from "./brand"

/**
 * What an agent may write back to the brand.
 *
 * A strategy conversation is where a brand explains itself: the goal, the
 * audience, the offer, the things it will not say. Leaving that in a chat
 * transcript means the next agent — and the Director after it — has to be told
 * all over again. These tools let the agent record what it just learned, so the
 * Brand panel fills in as the conversation goes.
 *
 * Identity fields (name, type) are deliberately absent: an agent renaming the
 * brand out from under its owner is never a helpful surprise.
 */
export const agentWritableBrandFields = [
  "tagline",
  "website_url",
  "industry",
  "description",
  "brand_voice",
  "audience",
  "positioning",
  "goals",
  "offer",
  "visual_style",
  "do_rules",
  "dont_rules",
  "color_palette",
  "forbidden_claims",
] as const

export type AgentWritableBrandField = (typeof agentWritableBrandFields)[number]

const textField = z.string().trim().max(10_000)
const listField = z.array(z.string().trim().min(1).max(300)).max(50)

export const brandProfileUpdateSchema = z.object({
  tagline: textField.optional(),
  website_url: textField.optional(),
  industry: textField.optional(),
  description: textField.optional(),
  brand_voice: textField.optional(),
  audience: textField.optional(),
  positioning: textField.optional(),
  goals: textField.optional(),
  offer: textField.optional(),
  visual_style: textField.optional(),
  do_rules: textField.optional(),
  dont_rules: textField.optional(),
  color_palette: listField.optional(),
  forbidden_claims: listField.optional(),
  // Only true when the user asked for that field to be changed. Defaulting it
  // to false is what keeps the agent from rewriting the owner's own words.
  overwrite: z.boolean().default(false),
}).strict()

export const brandKnowledgeToolSchema = z.object({
  kind: z.enum(brandKnowledgeKinds).default("note"),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().max(20_000).default(""),
  url: z.string().trim().max(1_000).default(""),
}).strict()

export const brandWebsiteToolSchema = z.object({
  url: z.string().trim().max(1_000).optional(),
}).strict()

export const brandAssetToolSchema = z.object({
  // Which of this turn's attached images to file, numbered as they were shown.
  attachment: z.number().int().positive().max(8),
  kind: z.enum(brandAssetKinds),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).default(""),
}).strict()

export const brandHandoffSchema = z.object({
  agent_key: z.string().trim().min(1).max(60),
  // What the receiving agent is being asked for. Without it the handover
  // arrives as "your turn" and the next agent starts by asking the user to
  // repeat the brief they just gave.
  brief: z.string().trim().max(4_000).default(""),
}).strict()

export type BrandProfileUpdateResult = {
  /** Fields to write, already filtered by the overwrite rule. */
  updates: Partial<Record<AgentWritableBrandField, string | string[]>>
  /** Fields the agent named that were left alone, and why. */
  skipped: AgentWritableBrandField[]
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return typeof value !== "string" || !value.trim()
}

/**
 * Works out which of the agent's proposed fields may actually be written.
 *
 * A field the owner already filled in is theirs. The agent gets to fill blanks
 * freely, because that is the whole point, but changing an answer the user gave
 * takes an explicit instruction — otherwise a passing remark in chat quietly
 * overwrites a positioning statement somebody spent an afternoon on.
 */
export function applyBrandProfileUpdate(
  current: Pick<BrandRecord, AgentWritableBrandField>,
  patch: Record<string, unknown>,
  overwrite = false,
): BrandProfileUpdateResult {
  const updates: BrandProfileUpdateResult["updates"] = {}
  const skipped: AgentWritableBrandField[] = []

  for (const field of agentWritableBrandFields) {
    const proposed = patch[field]
    if (proposed === undefined) continue
    if (isEmpty(proposed)) continue
    const existing = current[field]
    // An identical value is not a change, so it is neither written nor
    // reported as a skip the agent has to explain.
    if (!Array.isArray(proposed) && !Array.isArray(existing) && String(proposed).trim() === String(existing || "").trim()) continue
    if (!isEmpty(existing) && !overwrite) {
      skipped.push(field)
      continue
    }
    updates[field] = proposed as string | string[]
  }

  return { updates, skipped }
}

export const brandToolNames = ["update_brand_profile", "save_brand_knowledge", "save_brand_asset", "read_brand_website", "hand_off_to_agent"] as const
export type BrandToolName = (typeof brandToolNames)[number]

const profileFieldProperties = {
  tagline: { type: "string", description: "The brand's one-line tagline." },
  website_url: { type: "string", description: "The brand's website address." },
  industry: { type: "string", description: "The industry or category." },
  description: { type: "string", description: "What the business actually does, in plain sentences." },
  brand_voice: { type: "string", description: "How the brand sounds, with an example line if one was given." },
  audience: { type: "string", description: "Who the brand is talking to." },
  positioning: { type: "string", description: "Why someone picks this brand over the alternative." },
  goals: { type: "string", description: "What this period's content has to achieve." },
  offer: { type: "string", description: "What is being sold and the offer attached to it." },
  visual_style: { type: "string", description: "Lighting, palette, texture, and references for generated frames." },
  do_rules: { type: "string", description: "Things every piece of content must do." },
  dont_rules: { type: "string", description: "Things no piece of content may do." },
  color_palette: { type: "array", items: { type: "string" }, description: "Brand colours." },
  forbidden_claims: { type: "array", items: { type: "string" }, description: "Claims the brand must never make, in any wording." },
} as const

export function brandFunctionDefinitions() {
  return [
    {
      name: "update_brand_profile",
      description:
        "Record what you have learned about the brand on the Brand panel, so it is there for every future chat and for the AI Director. Call this whenever the user tells you something durable about their brand — their goal, audience, offer, voice, look, or a claim they cannot make. Blank fields are filled straight away. A field that already has an answer is left alone unless the user explicitly asked you to change it, in which case pass overwrite true.",
      parameters: {
        type: "object",
        properties: {
          ...profileFieldProperties,
          overwrite: { type: "boolean", description: "Only true when the user explicitly asked to change an answer they had already given." },
        },
      },
    },
    {
      name: "save_brand_knowledge",
      description:
        "Save a durable fact to the brand's knowledge base: a product detail, an audience insight, a competitor, a guideline, a link worth keeping. Use this for anything specific that does not belong in one of the Brand panel's fields. Do not save the conversation itself, opinions you formed, or the strategy you just wrote.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...brandKnowledgeKinds], description: "What sort of entry this is." },
          title: { type: "string", description: "A short name for the entry." },
          content: { type: "string", description: "The detail itself." },
          url: { type: "string", description: "A source link, if there is one." },
        },
        required: ["title"],
      },
    },
    {
      name: "save_brand_asset",
      description:
        "File an image the user attached to this turn into the brand's asset library, under what it actually is. Use character for a person the production will render, product for a thing being sold, logo for a mark, location for a place, and reference for a look or mood image that is none of those. Give it the name the brand calls it, because that name becomes the @handle every script and shot refers to it by. Only file images the user is clearly adding to the brand — not screenshots of a document, a chart, or a competitor's ad, which belong in the knowledge base instead.",
      parameters: {
        type: "object",
        properties: {
          attachment: { type: "number", description: "Which attached image, numbered as they were shown to you, starting at 1." },
          kind: { type: "string", enum: [...brandAssetKinds], description: "What the image actually is." },
          name: { type: "string", description: "What the brand calls it. This becomes its @handle in scripts and shots." },
          description: { type: "string", description: "What it looks like and anything the production must keep right about it." },
        },
        required: ["attachment", "kind", "name"],
      },
    },
    {
      name: "hand_off_to_agent",
      description:
        "Hand this conversation to another agent on this brand when the next step is their job — most often the Script Writer once an angle is agreed. The agent you name answers the user directly in this same reply, so hand over instead of describing what they would write. Pass a brief saying exactly what they are being asked for and what has already been decided. Do not hand off for something you can do yourself, and do not hand back and forth in one turn.",
      parameters: {
        type: "object",
        properties: {
          agent_key: { type: "string", description: "The key of the agent taking over, from the agent list in your instructions." },
          brief: { type: "string", description: "What they are being asked for, and the decisions already made." },
        },
        required: ["agent_key"],
      },
    },
    {
      name: "read_brand_website",
      description:
        "Read the brand's website and keep what it says. Call this when the user gives you a website address, or when the recorded site has not been read yet and you need what is on it. Pass url only when the user just gave you one; it is saved to the brand as well.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The website address the user just gave, if any." },
        },
      },
    },
  ]
}

/** A short human sentence for what a tool call did, shown under the reply. */
export function describeBrandToolResult(tool: BrandToolName, result: Record<string, unknown>): string {
  if (tool === "update_brand_profile") {
    const written = Array.isArray(result.updated) ? (result.updated as string[]) : []
    const skipped = Array.isArray(result.skipped) ? (result.skipped as string[]) : []
    const label = (fields: string[]) => fields.map((field) => field.replace(/_/g, " ")).join(", ")
    if (!written.length && skipped.length) return `Left your existing ${label(skipped)} alone.`
    if (!written.length) return ""
    return `Saved to the brand: ${label(written)}.${skipped.length ? ` Left your existing ${label(skipped)} alone.` : ""}`
  }
  if (tool === "save_brand_knowledge") {
    return result.title ? `Saved to the knowledge base: ${String(result.title)}.` : ""
  }
  if (tool === "save_brand_asset") {
    if (result.error) return `Could not file that image: ${String(result.error)}`
    return result.name ? `Filed ${String(result.name)} in the asset library as a ${String(result.kind)}.` : ""
  }
  if (tool === "hand_off_to_agent") {
    if (result.error) return ""
    return result.from && result.to ? `${String(result.from)} handed this to ${String(result.to)}.` : ""
  }
  if (tool === "read_brand_website") {
    const pages = Number(result.pagesRead || 0)
    if (result.error) return `Could not read the website: ${String(result.error)}`
    return pages ? `Read ${pages} page${pages === 1 ? "" : "s"} of the website.` : ""
  }
  return ""
}

/**
 * The roster an agent is shown, so a handover names a real teammate.
 *
 * Without this the model invents a plausible-sounding key, the handover fails,
 * and the user gets a reply about a colleague who does not exist.
 */
export function brandTeamRoster(agents: Array<{ agent_key: string; name: string; role_summary: string; writes_script: boolean }>, activeKey: string): string {
  const others = agents.filter((agent) => agent.agent_key !== activeKey)
  if (!others.length) return "You are the only agent on this brand. There is nobody to hand over to, so do the work yourself."
  const lines = others.map((agent) => `- ${agent.agent_key} — ${agent.name}: ${agent.role_summary || (agent.writes_script ? "writes scripts" : "advises")}`)
  return ["OTHER AGENTS ON THIS BRAND, for hand_off_to_agent:", ...lines].join("\n")
}
