import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

export const directorRuntimeSettingsSchema = z.object({
  orchestrationInstructions: z.string().trim().min(1).max(20_000),
  maxToolSteps: z.number().int().min(1).max(25),
  nextActionLimit: z.number().int().min(1).max(5),
  // Handing over and asking a colleague both cost a model call out of the same
  // step budget, so they are capped separately: without a ceiling two agents
  // will pass one request back and forth until the loop runs out and the user
  // gets a turn that did nothing.
  maxHandoffs: z.number().int().min(0).max(5).default(2),
  maxConsultations: z.number().int().min(0).max(8).default(3),
}).strict()

export type DirectorRuntimeSettings = z.infer<typeof directorRuntimeSettingsSchema>

export const defaultDirectorRuntimeSettings: DirectorRuntimeSettings = {
  orchestrationInstructions: "Use tools whenever workspace state is needed. Read saved project data before proposing changes. Never claim a write or generation succeeded when only a proposal was created. Persistent, costly, and destructive tools require approval. Explain failures in plain language and offer a safe recovery action. When the user asks for something you can already do — generate a named shot, regenerate an image — call the tool first and write afterwards. Prose written before the tool call delays the approval card the user is waiting for, and a shot that already has a saved prompt does not need that prompt restated back to them. Two sentences after the card is enough: what you proposed and what happens on approval.\n\nFAILURE RECOVERY\nClassify failures as transient, validation, approval, insufficient-credit, provider-policy, or terminal failures. Retry only transient provider or network failures, with a maximum of three attempts. Reuse the same workflow run, target snapshot, proposal, and billing operation. Never silently change the episode, shot, asset, prompt, cast, provider, model, cost, or generation type during recovery. Do not retry approval, insufficient-credit, safety-policy, or terminal failures. Report the exact problem and provide one safe next action. After a retry succeeds, verify the saved and attached output before reporting success.",
  maxToolSteps: 10,
  nextActionLimit: 3,
  maxHandoffs: 2,
  maxConsultations: 3,
}

export function normalizeDirectorRuntimeSettings(value: unknown): DirectorRuntimeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultDirectorRuntimeSettings)
  const raw = value as Record<string, unknown>
  return directorRuntimeSettingsSchema.parse({
    orchestrationInstructions: typeof raw.orchestrationInstructions === "string" && raw.orchestrationInstructions.trim() ? raw.orchestrationInstructions : defaultDirectorRuntimeSettings.orchestrationInstructions,
    maxToolSteps: typeof raw.maxToolSteps === "number" ? raw.maxToolSteps : defaultDirectorRuntimeSettings.maxToolSteps,
    maxHandoffs: typeof raw.maxHandoffs === "number" ? raw.maxHandoffs : defaultDirectorRuntimeSettings.maxHandoffs,
    maxConsultations: typeof raw.maxConsultations === "number" ? raw.maxConsultations : defaultDirectorRuntimeSettings.maxConsultations,
    nextActionLimit: typeof raw.nextActionLimit === "number" ? raw.nextActionLimit : defaultDirectorRuntimeSettings.nextActionLimit,
  })
}

export async function fetchDirectorRuntimeSettings(supabase: SupabaseClient) {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_runtime_settings").maybeSingle()
  return normalizeDirectorRuntimeSettings(data?.value)
}

export function runtimeInstructions(settings: DirectorRuntimeSettings) {
  return [settings.orchestrationInstructions, `Offer no more than ${settings.nextActionLimit} contextual next actions.`].join("\n")
}

/**
 * "Turn on full auto."
 *
 * Full auto hands the Director a credit budget and a job count and lets it run
 * without stopping to ask, so the gate on it has to read the sentence rather
 * than the words in it. "Don't turn on full auto yet" and "what happens if I
 * start autopilot?" both name the mode and name a start verb, and both used to
 * be answered with a proposal to enable it.
 */
export function requestsFullAutoEnable(message: string) {
  const normalized = message.toLowerCase()
  if (!/\b(full auto|full-auto|autopilot)\b/.test(normalized)) return false
  if (!/\b(enable|turn on|start|activate)\b/.test(normalized)) return false
  if (/\b(?:do not|don't|never|no need to|without|stop|disable|turn off)\b/.test(normalized)) return false
  // A question about the mode wants an explanation, not the mode.
  if (/^\s*(?:what|how|why|when|can|could|should|does|do)\b/.test(normalized) || normalized.includes("?")) return false
  return true
}
