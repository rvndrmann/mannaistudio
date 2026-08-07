import { creativeBriefSchema, type CreativeBrief } from "./domain"

export const creativeBriefQuestions: Array<{ field: keyof CreativeBrief; question: string }> = [
  { field: "objective", question: "What should this video achieve for you?" },
  { field: "audience", question: "Who is the most important audience for it?" },
  { field: "platform", question: "Where will people watch it?" },
  { field: "durationSeconds", question: "Roughly how long should the finished video be?" },
  { field: "productOrService", question: "What product, service, or story should be central?" },
  { field: "style", question: "What visual feeling or style should the production have?" },
  { field: "language", question: "Which language should dialogue or voiceover use?" },
  { field: "budgetCredits", question: "Do you want to set a generation-credit limit?" },
]

export function mergeCreativeBrief(current: unknown, patch: Partial<CreativeBrief>, confirm: Array<keyof CreativeBrief> = []): CreativeBrief {
  const existing = creativeBriefSchema.parse(current ?? {})
  const confirmedFields = Array.from(new Set([...existing.confirmedFields, ...confirm.map(String)]))
  return creativeBriefSchema.parse({ ...existing, ...patch, confirmedFields })
}

export function nextCreativeBriefQuestion(brief: CreativeBrief) {
  return creativeBriefQuestions.find(({ field }) => !brief.confirmedFields.includes(String(field))) ?? null
}

export function creativeBriefCompletion(brief: CreativeBrief): number {
  const confirmed = creativeBriefQuestions.filter(({ field }) => brief.confirmedFields.includes(String(field))).length
  return Math.round((confirmed / creativeBriefQuestions.length) * 100)
}
