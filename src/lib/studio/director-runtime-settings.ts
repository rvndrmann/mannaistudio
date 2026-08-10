import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

export const specialistInstructionKeys = ["script", "entities", "storyboard", "visuals", "continuity", "recovery"] as const
export type SpecialistInstructionKey = (typeof specialistInstructionKeys)[number]

export const directorRuntimeSettingsSchema = z.object({
  orchestrationInstructions: z.string().trim().min(1).max(20_000),
  maxToolSteps: z.number().int().min(1).max(25),
  nextActionLimit: z.number().int().min(1).max(5),
  specialists: z.object({
    script: z.string().trim().max(10_000),
    entities: z.string().trim().max(10_000),
    storyboard: z.string().trim().max(10_000),
    visuals: z.string().trim().max(10_000),
    continuity: z.string().trim().max(10_000),
    recovery: z.string().trim().max(10_000),
  }).strict(),
}).strict()

export type DirectorRuntimeSettings = z.infer<typeof directorRuntimeSettingsSchema>

export const defaultDirectorRuntimeSettings: DirectorRuntimeSettings = {
  orchestrationInstructions: "Use tools whenever workspace state is needed. Read saved project data before proposing changes. Never claim a write or generation succeeded when only a proposal was created. Persistent, costly, and destructive tools require approval. Explain failures in plain language and offer a safe recovery action.",
  maxToolSteps: 10,
  nextActionLimit: 3,
  specialists: {
    script: "Read the complete saved episode script when the user refers to existing script content. Do not ask the user to paste content that is already saved.",
    entities: "Inspect existing entities before proposing new characters, locations, or props. Avoid duplicates and use pagination for large projects.",
    storyboard: "Keep storyboard order aligned with the script. Validate referenced entity IDs and names before generation.",
    visuals: "Use approved references and continuity facts for image and video prompts. Report partial batch success accurately.",
    continuity: "Preserve approved and locked assets. Flag mismatched names, missing references, and conflicting continuity facts.",
    recovery: "Treat tool and provider failures as recoverable workflow events when possible. Retry with smaller pages or corrected valid inputs; never bypass safety systems.",
  },
}

export function normalizeDirectorRuntimeSettings(value: unknown): DirectorRuntimeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultDirectorRuntimeSettings)
  const raw = value as Record<string, unknown>
  const specialists = raw.specialists && typeof raw.specialists === "object" && !Array.isArray(raw.specialists) ? raw.specialists as Record<string, unknown> : {}
  return directorRuntimeSettingsSchema.parse({
    orchestrationInstructions: typeof raw.orchestrationInstructions === "string" && raw.orchestrationInstructions.trim() ? raw.orchestrationInstructions : defaultDirectorRuntimeSettings.orchestrationInstructions,
    maxToolSteps: typeof raw.maxToolSteps === "number" ? raw.maxToolSteps : defaultDirectorRuntimeSettings.maxToolSteps,
    nextActionLimit: typeof raw.nextActionLimit === "number" ? raw.nextActionLimit : defaultDirectorRuntimeSettings.nextActionLimit,
    specialists: Object.fromEntries(specialistInstructionKeys.map((key) => [key, typeof specialists[key] === "string" ? specialists[key] : defaultDirectorRuntimeSettings.specialists[key]])),
  })
}

export async function fetchDirectorRuntimeSettings(supabase: SupabaseClient) {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_runtime_settings").maybeSingle()
  return normalizeDirectorRuntimeSettings(data?.value)
}

export function runtimeInstructions(settings: DirectorRuntimeSettings, activeSpecialists: readonly SpecialistInstructionKey[] = specialistInstructionKeys) {
  return [settings.orchestrationInstructions, "Active specialist instructions:", ...activeSpecialists.map((key) => `${key}: ${settings.specialists[key]}`), `Offer no more than ${settings.nextActionLimit} contextual next actions.`].join("\n")
}
