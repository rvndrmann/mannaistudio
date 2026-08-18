import { z } from "zod"
import { buildBrandContext, type BrandAssetRecord, type BrandKnowledgeRecord, type BrandRecord } from "./brand"
import { brandKnowledgeToolSchema } from "./brand-tools"
import { creditShortfall, type ProductionEstimate } from "./production-estimate"

/**
 * The website chat, for a visitor who is signed in.
 *
 * The anonymous widget sells and captures. This one does the work: it takes a
 * requirement, records it on the brand, writes the script, opens the
 * production, and quotes what it will cost before a single credit is spent.
 * The quote is the point — a user who is told "that will be 2,040 credits, you
 * have 500" can decide, and one who is not finds out by running out halfway
 * through a storyboard.
 */

export const widgetScriptToolSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(100_000),
  overview: z.string().trim().max(4_000).default(""),
}).strict()

export const widgetSendToProjectSchema = z.object({
  script_id: z.string().uuid().optional(),
  project_name: z.string().trim().min(1).max(160).optional(),
}).strict()

export const widgetProposeSchema = z.object({
  project_id: z.string().uuid(),
  episode_id: z.string().uuid(),
  // What the production is, in the user's terms, for the top of the card.
  summary: z.string().trim().max(500).default(""),
  seconds_per_shot: z.number().int().positive().max(30).optional(),
}).strict()

export type ProductionProposal = {
  projectId: string
  episodeId: string
  summary: string
  estimate: ProductionEstimate
  balance: number
  shortfall: number
  /** What the user is being asked to agree to, in one readable block. */
  lines: string[]
}

export function buildProductionProposal(input: {
  projectId: string
  episodeId: string
  summary: string
  estimate: ProductionEstimate
  balance: number
}): ProductionProposal {
  const { estimate, balance } = input
  const shortfall = creditShortfall(estimate.totalCredits, balance)
  return {
    projectId: input.projectId,
    episodeId: input.episodeId,
    summary: input.summary,
    estimate,
    balance,
    shortfall,
    lines: [
      `${estimate.shotCount} shots · about ${estimate.totalSeconds}s at ${estimate.resolution}`,
      `Character and asset reference art — ${estimate.assetImageCredits} credits`,
      `Storyboard keyframes — ${estimate.imageCredits} credits`,
      `Video for every shot — ${estimate.videoCredits} credits`,
      `Total ${estimate.totalCredits} credits`,
      shortfall > 0
        ? `You have ${balance}. You need ${shortfall} more to finish this.`
        : `You have ${balance}, so this is covered.`,
    ],
  }
}

export function memberWidgetTools() {
  return [
    {
      name: "update_brand_profile",
      description:
        "Record what the user has told you about their brand or their project — what they do, who it is for, what they are selling, the look they want, anything they must never claim. Do this as you learn it. Blank fields are filled straight away; a field they already answered is left alone unless they asked you to change it, in which case pass overwrite true.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What the business or channel actually does." },
          goals: { type: "string", description: "What they are trying to achieve with this content." },
          offer: { type: "string", description: "What is being sold, and the offer attached." },
          audience: { type: "string", description: "Who it is for." },
          brand_voice: { type: "string", description: "How it should sound." },
          visual_style: { type: "string", description: "The look: lighting, palette, references." },
          positioning: { type: "string", description: "Why someone picks them over the alternative." },
          website_url: { type: "string", description: "Their website, if they give it." },
          industry: { type: "string", description: "Their category." },
          forbidden_claims: { type: "array", items: { type: "string" }, description: "Anything they must never claim." },
          overwrite: { type: "boolean", description: "Only when they asked to change an answer they already gave." },
        },
      },
    },
    {
      name: "save_brand_knowledge",
      description: "Save a specific durable fact worth keeping — a product detail, an audience insight, a reference they named.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", description: "note, link, product, service, audience, guideline, faq, or competitor." },
          title: { type: "string", description: "A short name for the entry." },
          content: { type: "string", description: "The detail itself." },
          url: { type: "string", description: "A source link, if there is one." },
        },
        required: ["title"],
      },
    },
    {
      name: "save_script",
      description:
        "Save the script you have written for them. Write it in timed beats — each beat becomes one shot — with the runtime they asked for. Call this once the script is written, before opening a production.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "What this piece is called." },
          overview: { type: "string", description: "One line on what it is and who it is for." },
          body: { type: "string", description: "The script itself, in timed beats with action and dialogue." },
        },
        required: ["title", "body"],
      },
    },
    {
      name: "send_script_to_project",
      description:
        "Open a production for a saved script. This writes it into the project's script section and imports the brand's product and character art as project assets, so the AI Director builds from their real look. Call it after save_script, using the script_id it returned.",
      parameters: {
        type: "object",
        properties: {
          script_id: { type: "string", description: "The id save_script returned." },
          project_name: { type: "string", description: "What to call the production." },
        },
      },
    },
    {
      name: "propose_production",
      description:
        "Quote what it will cost to build this production — character art, storyboard keyframes, and video for every shot — and show it to the user as an approval card with their credit balance. Call this after send_script_to_project and before telling them anything about starting. Never state a credit figure you have not got from this tool.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "From send_script_to_project." },
          episode_id: { type: "string", description: "From send_script_to_project." },
          summary: { type: "string", description: "What is being produced, in their words." },
          seconds_per_shot: { type: "number", description: "How long each shot runs. Leave out unless they asked for something specific." },
        },
        required: ["project_id", "episode_id"],
      },
    },
    {
      name: "get_credit_balance",
      description: "Read the user's current credit balance. Use it when they ask what they have, or before recommending a plan.",
      parameters: { type: "object", properties: {} },
    },
  ]
}

export const memberWidgetToolNames = memberWidgetTools().map((tool) => tool.name)

/**
 * The brief for a signed-in visitor.
 *
 * It sells, but the selling is doing the work in front of them: a user who
 * watches a script get written and a production open is being shown the
 * product, which is a better argument than a pitch. What it must not do is
 * spend anything or promise a price it made up.
 */
export function buildMemberWidgetInstructions(input: {
  brand: BrandRecord
  knowledge?: BrandKnowledgeRecord[]
  assets?: BrandAssetRecord[]
  balance: number
  userName?: string
}): string {
  return [
    "You are the AI Director Hub studio assistant, talking to a signed-in user on the website.",
    input.userName ? `They are ${input.userName}.` : "",
    "Your job is to get them from an idea to a production without leaving this chat. Ask what they want to make, what it is for, and how long it should run — one or two questions at a time, never a form.",
    "As they tell you about their brand or product, record it with update_brand_profile so it is there for every future piece and for the AI Director. Save specific facts with save_brand_knowledge.",
    "When you have enough to write from, write the script yourself and save it with save_script. Write in timed beats, one clear action per beat, each beat under fifteen seconds, at the runtime they asked for. Do not ask them to approve an outline first — show them the script.",
    "Then open the production with send_script_to_project, and quote it with propose_production. The card it produces is what they approve; do not tell them a total you did not get from that tool, and never guess at credit costs.",
    "After the card is shown, say plainly what happens next: they approve, and the AI Director builds the characters, the assets, and the storyboard in the studio.",
    `They currently hold ${input.balance} credits.`,
    "If they cannot afford the production, say so without apology and tell them exactly how many more they need. Credits are bought on the credits page, and a subscription includes a monthly allowance. Recommend the smaller version — fewer shots, shorter runtime, lower resolution — as a real option rather than only pushing them to buy.",
    "You cannot generate images or video yourself, take a payment, or apply a discount. You do not spend their credits; only the approval card does that.",
    // A paraphrased failure is unactionable for the user and undebuggable for
    // us; the exact text is the only useful thing in that moment.
    "If a tool comes back with an error, tell them it failed and quote the error text exactly as you received it. Never soften it into a general phrase like \"a permissions error\", and never guess at the cause.",
    "Keep replies short. This is a chat bubble, not a document. Never ask for a password or a card number.",
    "",
    buildBrandContext({ brand: input.brand, knowledge: input.knowledge, assets: input.assets }),
  ].filter(Boolean).join("\n")
}

export { brandKnowledgeToolSchema }
