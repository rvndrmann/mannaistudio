import { createHash } from "node:crypto"
import { z } from "zod"
import { buildBrandContext, type BrandAssetRecord, type BrandKnowledgeRecord, type BrandRecord } from "./brand"

/**
 * The website chat widget.
 *
 * A visitor on the brand's home page is not a signed-in user with a project;
 * they are somebody deciding whether this is for them. The agent's job here is
 * to answer that honestly out of the brand's own material and, when the visitor
 * is genuinely interested, to take their details — not to interrogate everyone
 * who says hello.
 */

export const leadWidgetMessageLimit = 1_500
/** Per visitor, per hour. A real conversation is well inside this. */
export const leadWidgetHourlyLimit = 40
/** One session cannot run forever on somebody else's model budget. */
export const leadWidgetSessionMessageLimit = 40
/** Turns kept for context. The lead fields carry what matters beyond this. */
export const leadWidgetHistoryLimit = 20
const transcriptLimit = 120

export const leadWidgetInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(leadWidgetMessageLimit),
  sourcePath: z.string().trim().max(500).default("/"),
}).strict()

export const captureLeadSchema = z.object({
  name: z.string().trim().max(160).default(""),
  email: z.string().trim().max(240).default(""),
  phone: z.string().trim().max(60).default(""),
  company: z.string().trim().max(200).default(""),
  intent: z.string().trim().max(2_000).default(""),
}).strict()

export type LeadFields = z.infer<typeof captureLeadSchema>
export type TranscriptEntry = { role: "visitor" | "agent"; content: string; at: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * A visitor identity that is not an IP address.
 *
 * Rate limiting needs to tell visitors apart; it does not need to know who they
 * are, and storing the address of everyone who opens a chat bubble would be
 * collecting personal data for no purpose the feature has.
 */
export function visitorKey(ip: string, userAgent: string, salt: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}|${salt}`).digest("hex").slice(0, 64)
}

/**
 * Merges what the agent just learned into the lead.
 *
 * Blanks never erase, because a visitor who gives a name and then declines to
 * give an email should not lose the name. An obviously invalid email is
 * refused rather than stored: a lead nobody can reply to reads as a lead.
 */
export function applyLeadCapture(current: LeadFields, patch: Partial<LeadFields>): { fields: LeadFields; rejected: string[] } {
  const next: LeadFields = { ...current }
  const rejected: string[] = []

  for (const key of ["name", "email", "phone", "company", "intent"] as const) {
    const value = (patch[key] || "").trim()
    if (!value) continue
    if (key === "email" && !EMAIL.test(value)) {
      rejected.push("email")
      continue
    }
    next[key] = value
  }

  return { fields: next, rejected }
}

/** A lead is worth flagging once there is a way to reach them. */
export function leadIsReachable(fields: LeadFields): boolean {
  return Boolean(fields.email.trim() || fields.phone.trim())
}

export function appendTranscript(transcript: unknown, entry: TranscriptEntry): TranscriptEntry[] {
  const current = Array.isArray(transcript) ? (transcript as TranscriptEntry[]) : []
  return [...current, entry].slice(-transcriptLimit)
}

export function transcriptHistory(transcript: unknown, limit = leadWidgetHistoryLimit): Array<{ role: "user" | "assistant"; content: string }> {
  const current = Array.isArray(transcript) ? (transcript as TranscriptEntry[]) : []
  return current
    .slice(-limit)
    .filter((entry) => entry && typeof entry.content === "string" && entry.content.trim())
    .map((entry) => ({ role: entry.role === "visitor" ? "user" as const : "assistant" as const, content: entry.content }))
}

export function widgetGreeting(brand: Pick<BrandRecord, "name"> & { widget_greeting?: string }): string {
  const configured = (brand.widget_greeting || "").trim()
  return configured || `Hi — I work with ${brand.name}. What are you trying to make?`
}

/**
 * The widget agent's brief.
 *
 * Deliberately not the studio's Content Strategist brief: that one is written
 * for a customer who already bought and wants a campaign plan. This one is
 * talking to a stranger, and the failure it has to avoid is being a chatbot
 * that demands an email before saying anything useful.
 */
export function buildLeadWidgetInstructions(input: {
  brand: BrandRecord
  knowledge?: BrandKnowledgeRecord[]
  assets?: BrandAssetRecord[]
}): string {
  return [
    `You answer visitors on ${input.brand.name}'s website, in the brand's own voice.`,
    "Answer the question first, in two or three sentences. A visitor who gets a real answer stays; one who gets a form leaves.",
    "Everything you say about the product, pricing, and what it can do comes from the brand material below. If it is not there, say you will have someone confirm it rather than inventing an answer — a wrong promise made here is one the brand has to honour.",
    "Never state a forbidden claim, in any wording.",
    "Once the visitor shows real interest — they describe what they want to make, ask about pricing or getting started, or ask to talk to someone — ask for their name and the best email to reach them, in one short sentence, and say what will happen next. Ask once. If they decline or change the subject, drop it and keep helping.",
    "Call capture_lead as soon as you have any of their details, and again when you learn more. Record what they said they want in intent, in their words.",
    "Never ask for a password, a card number, or anything you would not ask a stranger at a stand.",
    "Keep replies short. This is a chat bubble on a web page, not a document.",
    "You cannot open links, book meetings, apply discounts, or make commitments on the brand's behalf. Say what you can do and hand the rest to a person.",
    "",
    buildBrandContext({ brand: input.brand, knowledge: input.knowledge, assets: input.assets }),
  ].join("\n")
}

export function leadCaptureToolDefinition() {
  return {
    name: "capture_lead",
    description:
      "Record what you have learned about this visitor. Call it the moment you have any of their details, and again as you learn more — a name on its own is worth keeping. Put what they want to make in intent, in their own words.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Their name." },
        email: { type: "string", description: "Their email address." },
        phone: { type: "string", description: "Their phone number, if offered." },
        company: { type: "string", description: "Their company or brand." },
        intent: { type: "string", description: "What they said they are trying to make or achieve, in their words." },
      },
    },
  }
}
